-- ============================================================
-- Phase 3: invitations, expense categories, profile avatars
--
-- Builds on Phase 2 (20260615000002). Adds four feature areas, all kept in
-- the established "derive at read time, RLS scopes to your groups" style:
--
--   1. profiles.avatar_url + an `avatars` Storage bucket (public read,
--      owner-only write) for profile photos.
--   2. expense_category enum + expenses.category, threaded through the
--      save_expense RPC (whose signature therefore changes — see §4).
--   3. invitations table + invite_to_group / accept_invitation RPCs so a
--      member can invite someone by email even before they have an account.
--
-- Design notes:
--   * Still NO stored balances, no activity table — unchanged from Phase 1/2.
--   * accept_invitation is SECURITY INVOKER (per spec). That forces two RLS
--     widenings so the invitee — who is not a member yet — can read their own
--     invitation and insert their own membership row. Both are scoped to
--     "you have a pending, unexpired invitation whose email is yours", so the
--     function cannot be used to join a group you were not invited to.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles.avatar_url
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the user''s avatar in the `avatars` Storage bucket. Null = use initials.';

-- ------------------------------------------------------------
-- 2. avatars Storage bucket + policies
--
-- Public bucket: objects are world-readable via their public URL (simplest
-- for showing avatars anywhere). Writes are restricted to the owner's own
-- object, whose name is exactly `<uid>.jpg` (the per-user path the app uses).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- The object name the policies below pin each user to.
-- (storage.objects already has RLS enabled by Supabase.)
drop policy if exists "avatars_read_all" on storage.objects;
create policy "avatars_read_all"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.jpg'
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.jpg'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.jpg'
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.jpg'
  );

-- ------------------------------------------------------------
-- 3. expense_category enum + expenses.category
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_category') then
    create type public.expense_category as enum (
      'food', 'transport', 'accommodation', 'entertainment',
      'utilities', 'health', 'shopping', 'other'
    );
  end if;
end $$;

alter table public.expenses
  add column if not exists category public.expense_category;

comment on column public.expenses.category is
  'Optional category for the expense. Null = uncategorised.';

-- ------------------------------------------------------------
-- 4. save_expense(): add p_category
--
-- Adding a parameter changes the function's signature, so we DROP the Phase 2
-- 8-arg version (which also revokes its grant) and recreate a 9-arg version,
-- then re-grant the NEW exact signature. Mismatching the signature in the
-- grant is the Phase 2 footgun that aborts the whole migration (SQLSTATE
-- 42883) — the arg-type list below must match the create exactly.
--
-- p_category is last with a default so positional callers stay compatible;
-- the mobile client calls by name regardless.
-- ------------------------------------------------------------
revoke execute on function
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb)
  from authenticated;
drop function if exists
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb);

create or replace function public.save_expense(
  p_expense_id   uuid,
  p_group_id     uuid,
  p_paid_by      uuid,
  p_title        text,
  p_total_amount numeric,
  p_currency     text,
  p_split_type   text,
  p_participants jsonb,
  p_category     text default null
)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  v_expense  public.expenses;
  v_sum      numeric(12,2);
  v_bad      int;
  v_category public.expense_category;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not authorized for this group' using errcode = '42501';
  end if;

  if p_participants is null or jsonb_array_length(p_participants) = 0 then
    raise exception 'an expense needs at least one participant';
  end if;

  -- Validate the category against the enum (null = uncategorised).
  if p_category is not null and nullif(p_category, '') is not null then
    begin
      v_category := p_category::public.expense_category;
    exception when invalid_text_representation then
      raise exception 'invalid category: %', p_category;
    end;
  else
    v_category := null;
  end if;

  -- Every participant and the payer must belong to the group.
  select count(*) into v_bad
  from jsonb_array_elements(p_participants) as p
  where not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = (p->>'user_id')::uuid
  );
  if v_bad > 0 then
    raise exception 'all participants must be members of the group';
  end if;
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_paid_by
  ) then
    raise exception 'the payer must be a member of the group';
  end if;

  -- The split must reconcile to the total (to the cent).
  select coalesce(sum((p->>'share_amount')::numeric), 0)
    into v_sum
  from jsonb_array_elements(p_participants) as p;
  if round(v_sum, 2) <> round(p_total_amount, 2) then
    raise exception 'split shares (%) must sum to the total (%)', v_sum, p_total_amount;
  end if;

  if p_expense_id is null then
    insert into public.expenses
      (group_id, paid_by, title, total_amount, currency, status, split_type, category)
    values
      (p_group_id, p_paid_by, p_title, p_total_amount,
       coalesce(nullif(p_currency, ''), 'INR'), 'confirmed', p_split_type, v_category)
    returning * into v_expense;
  else
    update public.expenses
      set paid_by      = p_paid_by,
          title        = p_title,
          total_amount = p_total_amount,
          currency     = coalesce(nullif(p_currency, ''), currency),
          split_type   = p_split_type,
          category     = v_category
    where id = p_expense_id and group_id = p_group_id
    returning * into v_expense;

    if v_expense.id is null then
      raise exception 'expense not found' using errcode = 'P0002';
    end if;

    -- Rewrite the split from scratch.
    delete from public.expense_participants where expense_id = p_expense_id;
  end if;

  insert into public.expense_participants (expense_id, user_id, share_amount, split_value)
  select v_expense.id,
         (p->>'user_id')::uuid,
         (p->>'share_amount')::numeric,
         nullif(p->>'split_value', '')::numeric
  from jsonb_array_elements(p_participants) as p;

  return v_expense;
end;
$$;

grant execute on function
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb, text)
  to authenticated;

-- ------------------------------------------------------------
-- 5. invitations
--
-- A pending invite of an email address to a group. If the email already has a
-- profile we add them directly instead (see invite_to_group); a row here only
-- exists for people who do not yet have an account.
-- ------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  invited_by  uuid not null references public.profiles(id),
  email       text not null,
  token       uuid not null unique default gen_random_uuid(),
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'
);

comment on table public.invitations is
  'Pending email invitations to a group. Resolved by accept_invitation; not a balance/activity store.';

create index if not exists invitations_group_idx on public.invitations (group_id);
create index if not exists invitations_email_idx on public.invitations (lower(email));

alter table public.invitations enable row level security;

-- SELECT: group members can see their group's invitations; the inviter can
-- see theirs; AND the invitee (matched by email) can see their own invite.
-- The last clause is required so the SECURITY INVOKER accept_invitation can
-- read the row by token for a caller who is not a member yet.
drop policy if exists "invitations_select" on public.invitations;
create policy "invitations_select"
  on public.invitations for select
  to authenticated
  using (
    public.is_group_member(group_id)
    or invited_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.email) = lower(invitations.email)
    )
  );

-- INSERT: only a member of the group may create an invitation, and they must
-- stamp themselves as the inviter.
drop policy if exists "invitations_insert_member" on public.invitations;
create policy "invitations_insert_member"
  on public.invitations for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and invited_by = (select auth.uid())
  );

-- UPDATE: only the inviter or the invitee (by email) may update (accept).
drop policy if exists "invitations_update_party" on public.invitations;
create policy "invitations_update_party"
  on public.invitations for update
  to authenticated
  using (
    invited_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.email) = lower(invitations.email)
    )
  )
  with check (
    invited_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.email) = lower(invitations.email)
    )
  );

-- ------------------------------------------------------------
-- 6. group_members insert policy: also allow accepting an invitation
--
-- Replaces the Phase 1 policy (member-or-creator) with one that additionally
-- lets a user insert *their own* membership row when they hold a pending,
-- unexpired invitation whose email matches their profile. This is what makes
-- the SECURITY INVOKER accept_invitation able to add the invitee.
-- ------------------------------------------------------------
drop policy if exists "group_members_insert_member" on public.group_members;
create policy "group_members_insert_member"
  on public.group_members for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = (select auth.uid())
    )
    or (
      user_id = (select auth.uid())
      and exists (
        select 1
        from public.invitations i
        join public.profiles p on lower(p.email) = lower(i.email)
        where i.group_id = group_members.group_id
          and p.id = (select auth.uid())
          and i.status = 'pending'
          and i.expires_at > now()
      )
    )
  );

-- ------------------------------------------------------------
-- 7. invite_to_group(): add directly if the email has an account, else invite
--
-- SECURITY DEFINER for the same reason as add_group_member_by_email: RLS hides
-- profiles of people you do not already share a group with, so the email
-- lookup must run server-side. Caller membership is verified first.
-- Returns 'added' (existing user joined now) or 'invited' (pending invite).
-- ------------------------------------------------------------
create or replace function public.invite_to_group(
  p_group_id uuid,
  p_email    text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email   text := lower(trim(p_email));
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not authorized to invite to this group' using errcode = '42501';
  end if;

  if v_email = '' then
    raise exception 'an email is required';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = v_email;

  if v_user_id is not null then
    -- Existing user: add them straight away (idempotent).
    perform public.add_group_member_by_email(p_group_id, v_email);
    return 'added';
  end if;

  -- No account yet: create / refresh a pending invitation. A unique partial
  -- guard is overkill for an MVP, so just insert a fresh pending row.
  insert into public.invitations (group_id, invited_by, email)
  values (p_group_id, (select auth.uid()), v_email);

  return 'invited';
end;
$$;

grant execute on function public.invite_to_group(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 8. accept_invitation(): join the group a token invites you to
--
-- SECURITY INVOKER (default): every statement is subject to RLS. The widened
-- invitations SELECT / group_members INSERT policies above are exactly what
-- let the (not-yet-member) caller read the invite and add themselves. Returns
-- the group_id joined, so the client can navigate there.
-- ------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv
  from public.invitations
  where token = p_token;

  if v_inv.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'this invitation is no longer valid';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'this invitation has expired';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, (select auth.uid()), 'member')
  on conflict (group_id, user_id) do nothing;

  update public.invitations set status = 'accepted' where id = v_inv.id;

  return v_inv.group_id;
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;

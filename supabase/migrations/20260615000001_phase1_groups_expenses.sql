-- ============================================================
-- Phase 1: groups, members, expenses, splits, settlements + RLS
--
-- Builds on 20260610125610_initial_schema.sql, which already created
-- public.groups / group_members / expenses (and the AI itemization
-- tables expense_items / item_shares used in a later phase) but left
-- RLS *enabled with no policies* — i.e. fully locked. This migration:
--
--   1. Adds the split table (expense_participants) and settlements.
--   2. Adds SECURITY DEFINER membership helpers to keep RLS policies
--      simple and recursion-free.
--   3. Adds the policies that make the Phase 1 feature set usable while
--      enforcing "you can only touch groups you belong to".
--   4. Widens profiles SELECT so fellow group members are visible.
--   5. Adds an RPC to add members by email (RLS hides non-co-member
--      profiles, so a client-side lookup by email cannot work).
--
-- Design notes:
--   * We DO NOT store balances. expense_participants.share_amount is the
--     *split input* for one expense; balances are always derived from
--     expenses + expense_participants + settlements at read time.
--   * Unequal splits are already supported: a participant row can carry
--     any share_amount. expenses.split_type records the intent so the UI
--     can re-derive/validate; today the app only writes 'equal'.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Schema additions
-- ------------------------------------------------------------

-- Records how an expense's total was divided. Defaults to 'equal'; the
-- per-participant share_amount remains the source of truth either way.
alter table public.expenses
  add column if not exists split_type text not null default 'equal'
    check (split_type in ('equal', 'exact', 'percentage', 'shares'));

-- One row per person sharing in an expense. share_amount sums to the
-- expense total. (expense_id, user_id) is unique: a person appears once.
create table if not exists public.expense_participants (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.expenses(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  share_amount  numeric(12,2) not null check (share_amount >= 0),
  created_at    timestamptz not null default now(),
  unique (expense_id, user_id)
);

comment on table public.expense_participants is
  'Split of one expense across people. Sum(share_amount) = expense total. Not a balance.';

create index if not exists expense_participants_user_idx
  on public.expense_participants (user_id);

-- A real-money transfer from one member to another, reducing what the
-- payer owes. Settlements are the second input (with expenses) to the
-- balance computation; they are never themselves a balance.
create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  from_user   uuid not null references public.profiles(id),
  to_user     uuid not null references public.profiles(id),
  amount      numeric(12,2) not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now(),
  check (from_user <> to_user)
);

comment on table public.settlements is
  'A member paying another member back. Input to balance computation, not a stored balance.';

create index if not exists settlements_group_idx on public.settlements (group_id);

alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;

-- ------------------------------------------------------------
-- 1. Membership helpers (SECURITY DEFINER -> bypass RLS, no recursion)
-- ------------------------------------------------------------

-- True if the current user belongs to the given group. Used by nearly
-- every policy below. SECURITY DEFINER so referencing group_members
-- inside group_members' own policy does not recurse.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = (select auth.uid())
  );
$$;

-- True if the current user shares at least one group with `other`.
-- Powers the widened profiles SELECT policy.
create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid())
      and them.user_id = other
  );
$$;

-- ------------------------------------------------------------
-- 2. profiles: widen SELECT to co-members
-- ------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.shares_group_with(id)
  );

-- ------------------------------------------------------------
-- 3. groups
-- ------------------------------------------------------------

-- SELECT also allows the creator directly so that `insert ... returning`
-- works at creation time, before the creator's membership row exists.
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups for select
  to authenticated
  using (created_by = (select auth.uid()) or public.is_group_member(id));

drop policy if exists "groups_insert_self" on public.groups;
create policy "groups_insert_self"
  on public.groups for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member"
  on public.groups for update
  to authenticated
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

-- TODO(phase-next): groups DELETE policy (owner-only) + archive flow.

-- ------------------------------------------------------------
-- 4. group_members
-- ------------------------------------------------------------

drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT allowed for an existing member OR the group's creator (the
-- latter covers the bootstrap insert of the creator's own membership row
-- right after the group is created).
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
  );

-- A member may remove themselves; the creator may remove anyone.
drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete"
  on public.group_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = (select auth.uid())
    )
  );

-- TODO(phase-next): role changes (promote/demote) via UPDATE policy.

-- ------------------------------------------------------------
-- 5. expenses
-- ------------------------------------------------------------

drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member"
  on public.expenses for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expenses_insert_member" on public.expenses;
create policy "expenses_insert_member"
  on public.expenses for insert
  to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists "expenses_update_member" on public.expenses;
create policy "expenses_update_member"
  on public.expenses for update
  to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists "expenses_delete_member" on public.expenses;
create policy "expenses_delete_member"
  on public.expenses for delete
  to authenticated
  using (public.is_group_member(group_id));

-- ------------------------------------------------------------
-- 6. expense_participants  (membership derived via parent expense)
-- ------------------------------------------------------------

drop policy if exists "expense_participants_select" on public.expense_participants;
create policy "expense_participants_select"
  on public.expense_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_participants_insert" on public.expense_participants;
create policy "expense_participants_insert"
  on public.expense_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_participants_delete" on public.expense_participants;
create policy "expense_participants_delete"
  on public.expense_participants for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- ------------------------------------------------------------
-- 7. settlements
-- ------------------------------------------------------------

drop policy if exists "settlements_select_member" on public.settlements;
create policy "settlements_select_member"
  on public.settlements for select
  to authenticated
  using (public.is_group_member(group_id));

-- The payer (from_user) records the settlement and must be a member.
drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
  on public.settlements for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and from_user = (select auth.uid())
  );

drop policy if exists "settlements_delete_member" on public.settlements;
create policy "settlements_delete_member"
  on public.settlements for delete
  to authenticated
  using (public.is_group_member(group_id));

-- ------------------------------------------------------------
-- 8. Add member by email (RPC)
--
-- RLS hides profiles of people you do not already share a group with, so
-- a client cannot look a new member up by email. This SECURITY DEFINER
-- function does the lookup + insert server-side after verifying the
-- caller belongs to the target group.
-- ------------------------------------------------------------

create or replace function public.add_group_member_by_email(
  p_group_id uuid,
  p_email    text
)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row     public.group_members;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not authorized to add members to this group'
      using errcode = '42501';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'no SplitSmart user found with email %', p_email
      using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, v_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = v_user_id;

  return v_row;
end;
$$;

grant execute on function public.add_group_member_by_email(uuid, text) to authenticated;

-- ============================================================
-- Phase 6: multiple payers, expense comments, group cover photo
--
--   1. expense_payers: one row per payer when an expense is paid by more than
--      one person; amounts sum to the expense total. Single-payer expenses
--      leave this empty and rely on expenses.paid_by (unchanged).
--   2. expense_comments: per-expense discussion, own-row write RLS.
--   3. groups.cover_url: optional group photo.
--   4. save_expense gains an optional p_payers jsonb (array of {user_id,
--      amount}). 2+ payers => validate sum == total, paid_by := largest
--      contributor, rewrite expense_payers atomically. 0/1 => single-payer
--      flow (paid_by as passed, payer rows cleared).
--
-- Signature change footgun (Phase 2 SQLSTATE 42883): the old 9-arg grant is
-- revoked + dropped and the new 10-arg signature re-granted exactly.
-- ============================================================

-- ------------------------------------------------------------
-- 1. expense_payers
-- ------------------------------------------------------------
create table if not exists public.expense_payers (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  amount      numeric(12,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (expense_id, user_id)
);

comment on table public.expense_payers is
  'Per-payer contributions for multi-payer expenses. Sum = expense total. Empty for single-payer expenses.';

create index if not exists expense_payers_expense_idx
  on public.expense_payers (expense_id);

alter table public.expense_payers enable row level security;

drop policy if exists "expense_payers_select" on public.expense_payers;
create policy "expense_payers_select"
  on public.expense_payers for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_payers_insert" on public.expense_payers;
create policy "expense_payers_insert"
  on public.expense_payers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_payers_delete" on public.expense_payers;
create policy "expense_payers_delete"
  on public.expense_payers for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- ------------------------------------------------------------
-- 2. expense_comments
-- ------------------------------------------------------------
create table if not exists public.expense_comments (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  content     text not null check (char_length(content) < 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists expense_comments_expense_idx
  on public.expense_comments (expense_id, created_at);

alter table public.expense_comments enable row level security;

drop policy if exists "expense_comments_select" on public.expense_comments;
create policy "expense_comments_select"
  on public.expense_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_comments_insert" on public.expense_comments;
create policy "expense_comments_insert"
  on public.expense_comments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_comments_update_own" on public.expense_comments;
create policy "expense_comments_update_own"
  on public.expense_comments for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "expense_comments_delete_own" on public.expense_comments;
create policy "expense_comments_delete_own"
  on public.expense_comments for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists expense_comments_set_updated_at on public.expense_comments;
create trigger expense_comments_set_updated_at
  before update on public.expense_comments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. groups.cover_url
-- ------------------------------------------------------------
alter table public.groups
  add column if not exists cover_url text;

comment on column public.groups.cover_url is
  'Public URL of the group cover photo in the avatars bucket (groups/<id>.jpg). Null = no cover.';

-- ------------------------------------------------------------
-- 4. save_expense(): add optional p_payers (multi-payer support)
-- ------------------------------------------------------------
revoke execute on function
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb, text)
  from authenticated;
drop function if exists
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb, text);

create or replace function public.save_expense(
  p_expense_id   uuid,
  p_group_id     uuid,
  p_paid_by      uuid,
  p_title        text,
  p_total_amount numeric,
  p_currency     text,
  p_split_type   text,
  p_participants jsonb,
  p_category     text default null,
  p_payers       jsonb default '[]'::jsonb
)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  v_expense     public.expenses;
  v_sum         numeric(12,2);
  v_bad         int;
  v_category    public.expense_category;
  v_payer_count int := coalesce(jsonb_array_length(p_payers), 0);
  v_paid_by     uuid;
  v_psum        numeric(12,2);
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

  -- Every participant must belong to the group.
  select count(*) into v_bad
  from jsonb_array_elements(p_participants) as p
  where not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = (p->>'user_id')::uuid
  );
  if v_bad > 0 then
    raise exception 'all participants must be members of the group';
  end if;

  -- Resolve the payer(s). 2+ payers => validate and pick the largest as
  -- paid_by; otherwise the single payer passed in.
  if v_payer_count >= 2 then
    select count(*) into v_bad
    from jsonb_array_elements(p_payers) as p
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id and gm.user_id = (p->>'user_id')::uuid
    );
    if v_bad > 0 then
      raise exception 'all payers must be members of the group';
    end if;

    select coalesce(sum((p->>'amount')::numeric), 0) into v_psum
    from jsonb_array_elements(p_payers) as p;
    if round(v_psum, 2) <> round(p_total_amount, 2) then
      raise exception 'payer amounts (%) must sum to the total (%)', v_psum, p_total_amount;
    end if;

    select (p->>'user_id')::uuid into v_paid_by
    from jsonb_array_elements(p_payers) as p
    order by (p->>'amount')::numeric desc
    limit 1;
  else
    v_paid_by := p_paid_by;
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_paid_by
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
      (p_group_id, v_paid_by, p_title, p_total_amount,
       coalesce(nullif(p_currency, ''), 'INR'), 'confirmed', p_split_type, v_category)
    returning * into v_expense;
  else
    update public.expenses
      set paid_by      = v_paid_by,
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

  -- Rewrite payers: clear any existing, then insert when multi-payer.
  delete from public.expense_payers where expense_id = v_expense.id;
  if v_payer_count >= 2 then
    insert into public.expense_payers (expense_id, user_id, amount)
    select v_expense.id, (p->>'user_id')::uuid, (p->>'amount')::numeric
    from jsonb_array_elements(p_payers) as p;
  end if;

  return v_expense;
end;
$$;

grant execute on function
  public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb, text, jsonb)
  to authenticated;

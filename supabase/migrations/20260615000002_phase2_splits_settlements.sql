-- ============================================================
-- Phase 2: complete the expense-management workflow
--
-- Builds on 20260615000001_phase1_groups_expenses.sql. Phase 1 already
-- shipped expenses, expense_participants (the split), settlements and the
-- RLS that scopes everything to "groups you belong to". This migration
-- rounds out the *core Splitwise workflow*:
--
--   1. Preserve the split *input* per participant (split_value) so an
--      expense edited as a percentage/shares split can be re-opened and
--      shown the way it was entered — not just as derived amounts.
--   2. Track when an expense was last edited (updated_at) for the activity
--      feed's "edited" marker.
--   3. Let *any* member record a settlement between *any two* members and
--      remember who recorded it (recorded_by). Phase 1 only let the payer
--      record their own payment.
--   4. A single transactional save_expense() RPC that creates OR updates an
--      expense and rewrites its split atomically — removing the Phase 1
--      "two writes, no transaction" hazard for both create and edit.
--
-- Design notes (unchanged from Phase 1):
--   * We still DO NOT store balances. share_amount remains the source of
--     truth for the split; split_value is only the human input that
--     produced it, kept for round-tripping the edit form.
--   * Balances are derived at read time from expenses + participants +
--     settlements. recorded_by has no effect on the math.
-- ============================================================

-- ------------------------------------------------------------
-- 1. expense_participants: remember the split input
--
-- Meaning of split_value depends on the expense's split_type:
--   equal      -> null  (every share is equal; no input to remember)
--   exact      -> the exact amount the user typed (== share_amount)
--   percentage -> the percentage (0-100) the user assigned
--   shares     -> the integer share weight the user assigned
-- share_amount is always the resolved currency amount.
-- ------------------------------------------------------------
alter table public.expense_participants
  add column if not exists split_value numeric(12,4)
    check (split_value is null or split_value >= 0);

comment on column public.expense_participants.split_value is
  'Raw split input (percent / share-weight / exact amount) that produced share_amount. Null for equal splits.';

-- ------------------------------------------------------------
-- 2. expenses: last-edited timestamp + trigger
-- ------------------------------------------------------------
alter table public.expenses
  add column if not exists updated_at timestamptz not null default now();

-- Reuses public.set_updated_at() created in the profiles migration.
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. settlements: recorded_by + relaxed insert policy
--
-- A settlement is a real transfer from from_user (payer) to to_user
-- (receiver). recorded_by is whoever logged it — not necessarily a party
-- to the payment. This supports "I paid the rent, log that Alice repaid
-- Bob" style bookkeeping by any group member.
-- ------------------------------------------------------------
alter table public.settlements
  add column if not exists recorded_by uuid references public.profiles(id);

-- Backfill: pre-Phase-2 rows were always recorded by the payer.
update public.settlements
  set recorded_by = from_user
  where recorded_by is null;

alter table public.settlements
  alter column recorded_by set not null;

create index if not exists settlements_recorded_by_idx
  on public.settlements (recorded_by);

-- Replace the Phase 1 "payer records their own" insert policy with one
-- that lets any member record a settlement between any two *members* of
-- the group, while pinning recorded_by to the caller (no spoofing).
drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
  on public.settlements for insert
  to authenticated
  with check (
    recorded_by = (select auth.uid())
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id and gm.user_id = settlements.from_user
    )
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id and gm.user_id = settlements.to_user
    )
  );

-- ------------------------------------------------------------
-- 4. save_expense(): atomic create-or-update of an expense + its split
--
-- p_expense_id null  -> create; non-null -> update that expense.
-- p_participants is a JSON array of { user_id, share_amount, split_value }.
-- The whole function runs in one transaction, so a failed participant
-- insert (or a split that does not sum to the total) rolls back the
-- expense write too — fixing the Phase 1 partial-write hazard.
--
-- SECURITY INVOKER (the default): every statement is still subject to RLS,
-- so the caller can only write to groups they belong to. We add explicit
-- checks for clearer error messages and to validate participants are
-- members and shares reconcile to the total.
-- ------------------------------------------------------------
create or replace function public.save_expense(
  p_expense_id   uuid,
  p_group_id     uuid,
  p_paid_by      uuid,
  p_title        text,
  p_total_amount numeric,
  p_currency     text,
  p_split_type   text,
  p_participants jsonb
)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  v_expense public.expenses;
  v_sum     numeric(12,2);
  v_bad     int;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not authorized for this group' using errcode = '42501';
  end if;

  if p_participants is null or jsonb_array_length(p_participants) = 0 then
    raise exception 'an expense needs at least one participant';
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
      (group_id, paid_by, title, total_amount, currency, status, split_type)
    values
      (p_group_id, p_paid_by, p_title, p_total_amount,
       coalesce(nullif(p_currency, ''), 'INR'), 'confirmed', p_split_type)
    returning * into v_expense;
  else
    update public.expenses
      set paid_by      = p_paid_by,
          title        = p_title,
          total_amount = p_total_amount,
          currency     = coalesce(nullif(p_currency, ''), currency),
          split_type   = p_split_type
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

grant execute on function public.save_expense(uuid, uuid, uuid, text, numeric, text, text, jsonb)
  to authenticated;

-- ============================================================
-- Phase 5 (Part 1): push notifications
--
--   1. push_tokens: one Expo push token per user (own-row RLS).
--   2. dispatch_notification(): a guarded helper that POSTs to the `notify`
--      Edge Function via pg_net. It reads the service-role key from Vault
--      (so no secret is committed here) and swallows ALL errors, so a failed
--      notification can never roll back the business write that triggered it.
--   3. AFTER INSERT triggers on expenses / settlements / invitations that
--      build the recipient list + message and call dispatch_notification.
--
-- One-time manual setup (notifications stay silently disabled until then):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'notify_service_key');
-- ============================================================

-- ------------------------------------------------------------
-- 1. push_tokens
-- ------------------------------------------------------------
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  token       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.push_tokens is
  'Expo push token per user. One row per user (unique user_id).';

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. Notification dispatch via pg_net -> notify Edge Function
-- ------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_notification(
  p_user_ids uuid[],
  p_title    text,
  p_body     text,
  p_data     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text := 'https://uqldgcbuwtebqsfaiioi.supabase.co/functions/v1/notify';
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  -- Service-role key lives in Vault (set out-of-band); skip silently if absent.
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'notify_service_key';
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(p_user_ids),
      'title', p_title,
      'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
exception when others then
  -- Never let notification dispatch break the triggering write.
  return;
end;
$$;

-- ------------------------------------------------------------
-- 3a. expenses INSERT -> notify all group members except the payer
-- ------------------------------------------------------------
create or replace function public.notify_on_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer text;
  v_ids   uuid[];
  v_amt   text := trim(to_char(new.total_amount, 'FM999999990.00'));
begin
  select display_name into v_payer from public.profiles where id = new.paid_by;
  select array_agg(gm.user_id) into v_ids
  from public.group_members gm
  where gm.group_id = new.group_id and gm.user_id <> new.paid_by;

  perform public.dispatch_notification(
    v_ids,
    'New expense',
    coalesce(v_payer, 'Someone') || ' added ' || new.title || ' (₹' || v_amt || ')',
    jsonb_build_object('type', 'expense', 'group_id', new.group_id, 'expense_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists expenses_notify on public.expenses;
create trigger expenses_notify
  after insert on public.expenses
  for each row execute function public.notify_on_expense();

-- ------------------------------------------------------------
-- 3b. settlements INSERT -> notify the receiver (to_user)
-- ------------------------------------------------------------
create or replace function public.notify_on_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_amt  text := trim(to_char(new.amount, 'FM999999990.00'));
begin
  select display_name into v_from from public.profiles where id = new.from_user;

  perform public.dispatch_notification(
    array[new.to_user],
    'Payment received',
    coalesce(v_from, 'Someone') || ' paid you ₹' || v_amt,
    jsonb_build_object('type', 'settlement', 'group_id', new.group_id, 'settlement_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists settlements_notify on public.settlements;
create trigger settlements_notify
  after insert on public.settlements
  for each row execute function public.notify_on_settlement();

-- ------------------------------------------------------------
-- 3c. invitations INSERT -> notify the invitee if they already have a profile
-- ------------------------------------------------------------
create or replace function public.notify_on_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid;
  v_inviter text;
  v_group   text;
begin
  select id into v_uid from public.profiles where lower(email) = lower(new.email);
  if v_uid is null then
    return new; -- no account yet; nothing to push to
  end if;

  select display_name into v_inviter from public.profiles where id = new.invited_by;
  select name into v_group from public.groups where id = new.group_id;

  perform public.dispatch_notification(
    array[v_uid],
    'Group invitation',
    coalesce(v_inviter, 'Someone') || ' invited you to ' || coalesce(v_group, 'a group'),
    jsonb_build_object('type', 'invitation', 'group_id', new.group_id)
  );
  return new;
end;
$$;

drop trigger if exists invitations_notify on public.invitations;
create trigger invitations_notify
  after insert on public.invitations
  for each row execute function public.notify_on_invitation();

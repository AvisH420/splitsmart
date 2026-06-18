-- ============================================================
-- Phase 4: AI backbone
--
-- Wires up the schema the AI features need, without changing the core
-- derive-at-read-time philosophy:
--
--   1. group_memories: switch the embedding to vector(768) (Gemini
--      text-embedding-004), add a `source` column, and finally give the
--      table the RLS policies it never had (it was RLS-enabled but
--      policy-less since the initial schema = fully locked).
--   2. expenses.title_embedding vector(768) for semantic expense search.
--   3. RLS policies for expense_items / item_shares (also locked until now)
--      so AI receipt scanning can write per-item splits under the caller's
--      own RLS context.
--   4. pgvector match RPCs (SECURITY INVOKER, so RLS still applies) used by
--      the retrieve-memories and search-expenses Edge Functions — supabase-js
--      cannot run the raw `<=>` similarity query, so it goes through these.
--
-- Embeddings are written only by Edge Functions (service of Gemini); the app
-- never reads the raw vectors.
-- ============================================================

-- ------------------------------------------------------------
-- 1. group_memories: 768-dim embedding + source + RLS
-- ------------------------------------------------------------

-- The AI memory feature was never used, so there are no real embeddings to
-- preserve; null any stragglers before shrinking the dimension (a direct
-- type change with incompatible data would error).
update public.group_memories set embedding = null where embedding is not null;

alter table public.group_memories
  alter column embedding type vector(768);

alter table public.group_memories
  add column if not exists source text
    check (source in ('user_stated', 'ai_inferred', 'system'))
    default 'system';

comment on column public.group_memories.source is
  'How the memory originated: user_stated (typed by a member), ai_inferred, or system.';

-- RLS: scoped to the group, like everything else.
drop policy if exists "group_memories_select_member" on public.group_memories;
create policy "group_memories_select_member"
  on public.group_memories for select
  to authenticated
  using (public.is_group_member(group_id));

-- A member may add a memory; they must stamp themselves as the author.
drop policy if exists "group_memories_insert_member" on public.group_memories;
create policy "group_memories_insert_member"
  on public.group_memories for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and author_id = (select auth.uid())
  );

drop policy if exists "group_memories_update_member" on public.group_memories;
create policy "group_memories_update_member"
  on public.group_memories for update
  to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- A member may delete their own memory; the group creator may delete any.
drop policy if exists "group_memories_delete" on public.group_memories;
create policy "group_memories_delete"
  on public.group_memories for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = (select auth.uid())
    )
  );

-- Cosine-distance index for similarity search.
create index if not exists group_memories_embedding_idx
  on public.group_memories using hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------------------
-- 2. expenses.title_embedding for semantic search
-- ------------------------------------------------------------
alter table public.expenses
  add column if not exists title_embedding vector(768);

comment on column public.expenses.title_embedding is
  'Gemini embedding of the title for semantic search. Null until embedded; existing rows are not backfilled.';

create index if not exists expenses_title_embedding_idx
  on public.expenses using hnsw (title_embedding vector_cosine_ops);

-- ------------------------------------------------------------
-- 3. expense_items / item_shares RLS (membership via parent expense)
--
-- These tables existed since the initial schema but were RLS-enabled with no
-- policies (locked). Receipt scanning writes them, so they get the same
-- "member of the owning expense's group" scoping as expense_participants.
-- ------------------------------------------------------------
drop policy if exists "expense_items_all_member" on public.expense_items;
create policy "expense_items_all_member"
  on public.expense_items for all
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "item_shares_all_member" on public.item_shares;
create policy "item_shares_all_member"
  on public.item_shares for all
  to authenticated
  using (
    exists (
      select 1
      from public.expense_items ei
      join public.expenses e on e.id = ei.expense_id
      where ei.id = item_shares.item_id and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.expense_items ei
      join public.expenses e on e.id = ei.expense_id
      where ei.id = item_shares.item_id and public.is_group_member(e.group_id)
    )
  );

-- ------------------------------------------------------------
-- 4. pgvector match RPCs
--
-- SECURITY INVOKER (default): the SELECTs inside run under the caller's RLS,
-- so a user only ever matches rows in groups they belong to. The explicit
-- group_id filter is for selectivity, not security. The query_embedding is
-- passed from supabase-js as a JSON number array and cast to vector.
-- ------------------------------------------------------------
create or replace function public.match_group_memories(
  p_group_id      uuid,
  query_embedding vector(768),
  match_count     int default 5
)
returns table (
  id          uuid,
  content     text,
  memory_type text,
  similarity  float
)
language sql
stable
set search_path = public
as $$
  select gm.id,
         gm.content,
         gm.memory_type::text,
         1 - (gm.embedding <=> query_embedding) as similarity
  from public.group_memories gm
  where gm.group_id = p_group_id
    and gm.embedding is not null
    and gm.status = 'active'
  order by gm.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function
  public.match_group_memories(uuid, vector, int) to authenticated;

create or replace function public.match_expenses(
  p_group_id      uuid,
  query_embedding vector(768),
  match_count     int default 20
)
returns table (
  id         uuid,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select e.id,
         1 - (e.title_embedding <=> query_embedding) as similarity
  from public.expenses e
  where e.group_id = p_group_id
    and e.title_embedding is not null
  order by e.title_embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function
  public.match_expenses(uuid, vector, int) to authenticated;

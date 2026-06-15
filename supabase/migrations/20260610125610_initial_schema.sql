create extension if not exists "uuid-ossp";
create extension if not exists vector;

create type group_role as enum ('owner', 'member');
create type expense_status as enum ('draft', 'needs_review', 'confirmed');
create type item_category as enum ('food', 'veg', 'non_veg', 'alcohol', 'other');
create type memory_type as enum ('preference', 'rule', 'habit');
create type memory_status as enum ('active', 'archived', 'superseded');
create type suggestion_status as enum ('pending', 'accepted', 'rejected');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role group_role not null default 'member',
  is_vegetarian boolean not null default false,
  drinks_alcohol boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  title text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency text not null default 'INR',
  status expense_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2),
  amount numeric(12,2) not null check (amount >= 0),
  category item_category not null default 'other',
  confidence numeric(4,3),
  is_ai_generated boolean not null default false,
  is_user_edited boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.item_shares (
  item_id uuid not null references public.expense_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  primary key (item_id, user_id)
);

create table public.group_memories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  memory_type memory_type not null,
  content text not null,
  embedding vector(1536),
  embedding_model text,
  status memory_status not null default 'active',
  superseded_by uuid references public.group_memories(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  query_text text not null,
  retrieved jsonb not null default '[]'::jsonb,
  purpose text not null,
  model text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table public.memory_suggestions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  memory_id uuid not null references public.group_memories(id) on delete cascade,
  suggestion jsonb not null,
  status suggestion_status not null default 'pending',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.item_shares enable row level security;
alter table public.group_memories enable row level security;
alter table public.memory_retrieval_logs enable row level security;
alter table public.memory_suggestions enable row level security;
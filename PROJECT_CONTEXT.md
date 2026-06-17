# SplitSmart — Project Context

> A single-source briefing for anyone (human or AI) picking up this codebase cold.
> Paste this whole file into a new conversation and it should be enough to orient
> on goals, architecture, schema, conventions, and what to build next.

Last updated: 2026-06-18 (end of Phase 2).

---

## 1. What SplitSmart is

SplitSmart is a **Splitwise-style shared-expense app**: groups of people record
shared expenses, split each expense among participants, and settle up. It is
built as an **Expo / React Native mobile app backed by Supabase (Postgres + Auth
+ RLS)**.

### Product goals

- Let a group track who paid for what and who owes whom.
- Support the four canonical split types: **equal, exact amounts, percentages, shares**.
- Let any member **record a settlement** (a real money transfer) between any two members.
- Keep balances **always correct and always derived** — never store a balance that
  can drift out of sync with the underlying expenses and settlements.
- Stay simple and offline-friendly in spirit: no realtime, no push notifications,
  no AI/OCR (yet — see roadmap), no currency conversion, no recurring expenses.

### Longer-term ambition (not yet built)

The original schema (see `20260610125610_initial_schema.sql`) was scaffolded with
an **AI receipt-itemization + group-memory** feature in mind: `expense_items`,
`item_shares`, `group_memories` (with a `vector(1536)` embedding column),
`memory_retrieval_logs`, and `memory_suggestions` tables exist but are **unused by
the current app**. There is also an empty `services/ai-service/` Python-style
scaffold and a `packages/shared-types/` stub. Treat all of these as **future
roadmap placeholders**, not active code.

---

## 2. Tech stack

| Layer            | Choice                                                        |
|------------------|---------------------------------------------------------------|
| Mobile app       | Expo SDK **54** (`expo ~54.0.34`), React Native **0.81.5**, React **19.1.0** |
| Routing          | **expo-router ~6** (file-based, typed routes enabled)         |
| Language         | TypeScript (strict, via `expo/tsconfig.base`)                 |
| Backend          | **Supabase** — Postgres, Auth, Row-Level Security, RPCs       |
| DB client        | `@supabase/supabase-js ^2.108`                                |
| Auth storage     | `@react-native-async-storage/async-storage` + `expo-secure-store` |
| Local DB tooling | Supabase CLI (`npx supabase ...`), migrations under `supabase/migrations` |

New Architecture is enabled (`newArchEnabled: true`), iOS phone-only, light mode.

> **Important Expo note** (from `apps/mobile/AGENTS.md`): Expo changes fast. Before
> writing Expo/React Native code, check the **versioned** docs for SDK 54:
> https://docs.expo.dev/versions/v54.0.0/ — do not rely on memory of older APIs.

---

## 3. Repository structure

This is a monorepo, but **only `apps/mobile` and `supabase/` are active today.**

```
splitsmart/
├── PROJECT_CONTEXT.md          ← you are here
├── package.json                ← near-empty root (no workspace tooling wired up)
├── tsconfig.json               ← extends expo/tsconfig.base
├── apps/
│   └── mobile/                 ← THE app (Expo + expo-router)
│       ├── app/                ← file-based routes
│       │   ├── _layout.tsx     ← root layout (auth gate; header off)
│       │   ├── (auth)/         ← login / signup (unauthenticated stack)
│       │   │   ├── _layout.tsx
│       │   │   ├── login.tsx
│       │   │   └── signup.tsx
│       │   └── (app)/          ← authenticated stack (headers on)
│       │       ├── _layout.tsx ← registers every screen + titles/modals
│       │       ├── index.tsx   ← group list ("Groups")
│       │       └── groups/
│       │           ├── new.tsx              ← create group (modal)
│       │           └── [id]/
│       │               ├── index.tsx        ← group detail: summary, balances, members, expenses
│       │               ├── members.tsx      ← add member by email (modal)
│       │               ├── expense.tsx      ← create OR edit an expense (modal)
│       │               ├── settle.tsx       ← record a settlement (modal)
│       │               ├── activity.tsx     ← group activity feed
│       │               └── expenses/
│       │                   └── [expenseId].tsx  ← expense detail (view/edit/delete)
│       ├── lib/                ← all non-UI logic
│       │   ├── supabase.ts             ← configured Supabase client (reads EXPO_PUBLIC_* env)
│       │   ├── auth-context.tsx        ← React context exposing the Supabase session
│       │   ├── types.ts                ← hand-written domain types (kept in sync w/ migrations)
│       │   ├── database.types.ts       ← hand-written Supabase `Database` generic type
│       │   ├── format.ts               ← formatMoney / parseAmount helpers
│       │   ├── profile.ts              ← profile helpers
│       │   ├── balances.ts             ← computeBalances, suggestSettlements, equalSplit (PURE)
│       │   ├── splits.ts               ← computeSplit, validateSplit (PURE split math)
│       │   ├── stats.ts                ← computeGroupSummary (PURE)
│       │   └── repositories/           ← thin data-access layer over supabase-js
│       │       ├── util.ts             ← unwrap / unwrapList (throw on error)
│       │       ├── groups.ts
│       │       ├── members.ts
│       │       ├── expenses.ts         ← saveExpense (RPC), get/list, deleteExpense
│       │       ├── settlements.ts      ← createSettlement, listSettlements, deleteSettlement
│       │       └── activity.ts         ← listActivity (merges expenses+settlements+joins)
│       ├── app.json, package.json, CLAUDE.md, AGENTS.md
├── supabase/
│   ├── config.toml             ← local Supabase config (API on :54321)
│   └── migrations/             ← ordered SQL migrations (the source of truth for schema)
│       ├── 20260610000002_profiles_auth.sql            ← Phase 0: profiles + signup trigger
│       ├── 20260610125610_initial_schema.sql           ← initial tables (incl. unused AI tables)
│       ├── 20260615000001_phase1_groups_expenses.sql   ← Phase 1: splits, settlements, RLS
│       └── 20260615000002_phase2_splits_settlements.sql ← Phase 2: split input, edit, save_expense RPC
├── docs/
│   ├── architecture.md         ← (currently empty)
│   └── PHASE0_SETUP.md
├── packages/
│   └── shared-types/           ← empty stub (future)
└── services/
    └── ai-service/             ← empty Python-style scaffold (future AI itemization)
```

> Note on migration ordering: filenames sort lexicographically, so
> `20260610000002_profiles_auth.sql` actually runs **before**
> `20260610125610_initial_schema.sql`. The profiles file is written defensively
> (`create table if not exists`, `drop policy if exists`) so order is safe.

---

## 4. Architecture & core design philosophy

### 4.1 Layering

```
React screens (app/**)                  ← UI only; compose pure logic + repositories
   │
   ├── lib/balances.ts, splits.ts, stats.ts   ← PURE functions, no I/O, unit-test friendly
   │
   └── lib/repositories/*                ← the ONLY place that touches supabase-js
          │
          └── lib/supabase.ts            ← single configured client
                 │
                 └── Supabase (Postgres + RLS + RPCs)
```

Rules of thumb that the codebase follows:

- **Screens never call `supabase` directly** — they call repository functions.
- **Split/balance/stats math lives in pure modules** (`balances.ts`, `splits.ts`,
  `stats.ts`) with no I/O, so it can be reasoned about and tested in isolation.
- **Repositories are thin**: build a query, `unwrap`/`unwrapList` it (which throws
  on `error`), return typed rows. No business logic.

### 4.2 Balances are DERIVED, never stored

This is the single most important design decision. There is **no `balances`
table**. A member's net position is recomputed at read time:

```
net(u) =  Σ(expense totals u paid)
        − Σ(u's share_amount across all expenses)
        + Σ(settlements u paid out)
        − Σ(settlements u received)
```

`net > 0` ⇒ the group owes `u` (creditor). `net < 0` ⇒ `u` owes the group (debtor).
Nets sum to ≈0. See `lib/balances.ts::computeBalances`. The "who pays whom"
suggestions come from a greedy largest-debtor/largest-creditor match
(`suggestSettlements`), which is intuitive but not provably minimal — acceptable
for an MVP.

### 4.3 Integer-cents arithmetic

All money math is done in **integer cents** (`Math.round(amount * 100)`) to avoid
floating-point drift, then converted back. Split remainders (the leftover cent or
two) are distributed deterministically: `equalSplit` gives them to the first few
people; weighted splits (`distributeByWeights` in `splits.ts`) give them to the
**largest fractional remainders**. Shares always sum **exactly** to the total.

### 4.4 The split model (Phase 2)

`expense_participants` stores **two** things per participant:

- `share_amount numeric(12,2)` — the resolved currency amount owed. **Source of truth.**
- `split_value numeric(12,4)` — the **raw input** the user typed, so the edit form
  can be re-hydrated exactly as entered. Interpretation depends on `expenses.split_type`:
  - `equal` → `null` (nothing to remember)
  - `exact` → the exact amount typed (equals `share_amount`)
  - `percentage` → the percent (0–100)
  - `shares` → the integer share weight

Client computes the split via `computeSplit(...)`, validates with
`validateSplit(...)` (mirrors the server reconciliation check for instant
feedback), then persists via the `save_expense` RPC.

### 4.5 Atomic writes via `save_expense` RPC

Creating/editing an expense touches two tables (`expenses` + `expense_participants`).
Phase 1 did this as two separate writes (a partial-write hazard). Phase 2 replaced
it with a single transactional plpgsql function, `public.save_expense(...)`:

- `p_expense_id IS NULL` → **create**; non-null → **update** (and rewrite the split:
  delete-then-reinsert participants).
- Validates: caller is a group member; ≥1 participant; payer and all participants
  are members; shares reconcile to the total (rounded to 2dp).
- Runs **`SECURITY INVOKER`** (the default) so every statement is still subject to
  RLS — the explicit checks are for clearer errors, not for bypassing RLS.
- Whole thing is one transaction → a bad split rolls back the expense write too.

### 4.6 Settlement model (Phase 2)

A `settlement` is a real transfer `from_user` (payer) → `to_user` (receiver).
Phase 2 added `recorded_by` (who logged it, may be a third party) and relaxed RLS
so **any member can record a settlement between any two members**, while pinning
`recorded_by` to the caller (`= auth.uid()`) so it can't be spoofed. `recorded_by`
has **no effect on balance math** — it's bookkeeping/audit only.

### 4.7 Activity feed & summary stats (Phase 2, derived)

Both are computed at read time, **no new tables**:

- `lib/repositories/activity.ts::listActivity` merges expenses + settlements +
  member-join events into a newest-first `ActivityItem[]` discriminated union
  (`'expense' | 'settlement' | 'member_joined'`). Marks `edited` when
  `updated_at !== created_at`; sets `recordedByName` only when the recorder is not
  a party to the payment.
- `lib/stats.ts::computeGroupSummary` returns `totalSpent`, `expenseCount`,
  `settlementCount`, `memberCount`, `totalSettled`, `perMember[]`, `largestExpense`.

---

## 5. Database schema (current, active tables)

All tables are in the `public` schema. RLS is enabled on everything.

### `profiles` — 1:1 with `auth.users`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | FK → `auth.users(id)` on delete cascade |
| email | text | |
| display_name | text not null | defaults to email local-part on signup |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

Created automatically on signup by the `handle_new_user()` trigger (SECURITY
DEFINER) on `auth.users`.

### `groups`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| name | text not null | |
| created_by | uuid not null | FK → profiles |
| created_at | timestamptz | |

### `group_members` (PK = `(group_id, user_id)`)
| col | type | notes |
|-----|------|-------|
| group_id | uuid | FK → groups |
| user_id | uuid | FK → profiles |
| role | `group_role` enum (`owner`/`member`) | default `member` |
| is_vegetarian | bool | (carried over from AI-feature scaffold) |
| drinks_alcohol | bool | (ditto) |
| created_at | timestamptz | used as the "joined" timestamp in activity feed |

### `expenses`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| group_id | uuid | FK → groups |
| paid_by | uuid | FK → profiles |
| title | text not null | |
| total_amount | numeric(12,2) ≥ 0 | |
| currency | text | default `'INR'` |
| status | `expense_status` enum (`draft`/`needs_review`/`confirmed`) | `save_expense` writes `'confirmed'` |
| split_type | text check in (`equal`,`exact`,`percentage`,`shares`) | added Phase 1, default `equal` |
| created_at | timestamptz | |
| updated_at | timestamptz | added Phase 2; trigger `expenses_set_updated_at` |

### `expense_participants` (unique `(expense_id, user_id)`)
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| expense_id | uuid | FK → expenses on delete cascade |
| user_id | uuid | FK → profiles |
| share_amount | numeric(12,2) ≥ 0 | resolved amount owed — **source of truth** |
| split_value | numeric(12,4) ≥ 0, nullable | added Phase 2; raw input, null for equal |
| created_at | timestamptz | |

### `settlements`
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| group_id | uuid | FK → groups |
| from_user | uuid | payer; FK → profiles |
| to_user | uuid | receiver; FK → profiles; `check (from_user <> to_user)` |
| amount | numeric(12,2) > 0 | |
| note | text nullable | |
| recorded_by | uuid not null | added Phase 2; FK → profiles; who logged it |
| created_at | timestamptz | |

### Unused / future tables (created but not used by the app)
`expense_items`, `item_shares`, `group_memories` (has `vector(1536)` embedding),
`memory_retrieval_logs`, `memory_suggestions`. Enums `item_category`,
`memory_type`, `memory_status`, `suggestion_status` exist for these. Extensions
`uuid-ossp` and `vector` are enabled.

### Server-side functions (RPCs)
- `handle_new_user()` — trigger, SECURITY DEFINER: creates a profile row on signup.
- `set_updated_at()` — generic `updated_at` trigger function.
- `is_group_member(gid uuid)` — SECURITY DEFINER, used by nearly every policy
  (definer avoids RLS recursion on `group_members`).
- `shares_group_with(other uuid)` — SECURITY DEFINER, powers profile visibility.
- `add_group_member_by_email(p_group_id, p_email)` — SECURITY DEFINER: looks up a
  profile by email server-side (clients can't, due to RLS) and inserts membership.
- `save_expense(p_expense_id, p_group_id, p_paid_by, p_title, p_total_amount,
  p_currency, p_split_type, p_participants jsonb)` — SECURITY INVOKER, transactional
  create-or-update of an expense + its split. **Signature has TWO `text` params**
  (`p_currency`, `p_split_type`); the full signature for `grant`/`drop` is
  `(uuid, uuid, uuid, text, numeric, text, text, jsonb)`.

---

## 6. RLS (Row-Level Security) model

RLS is **enabled on every table**, and the governing rule across the app is:
**"you can only see or touch groups you belong to."** It is enforced via the
`is_group_member()` / `shares_group_with()` SECURITY DEFINER helpers.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | own row **or** co-member (`shares_group_with`) | own row only | own row only | — (cascade via auth.users) |
| groups | creator **or** member | `created_by = auth.uid()` | members | — (TODO: owner-only delete) |
| group_members | members | existing member **or** group creator (bootstrap) | — (TODO: role changes) | self **or** group creator |
| expenses | members | members | members | members |
| expense_participants | via parent expense's group membership | same | — | via parent expense's group membership |
| settlements | members | **any member**, but `recorded_by = auth.uid()` AND both `from_user` & `to_user` are members | — | members |

Key subtleties:

- The `groups` SELECT policy also allows the creator directly so that
  `insert ... returning` works at creation time, **before** the creator's
  membership row exists.
- The `settlements` INSERT policy was **changed in Phase 2** from "payer records
  their own payment" (`from_user = auth.uid()`) to "any member records between any
  two members, pinned to `recorded_by = auth.uid()`".
- `save_expense` is `SECURITY INVOKER`, so it cannot escalate — it writes only what
  the caller's RLS already permits.

---

## 7. Current features (what works today)

- **Auth**: email/password signup + login (Supabase Auth). Profile auto-created on
  signup. Session persisted via AsyncStorage; auto-refresh gated to foreground.
- **Groups**: list your groups, create a group, open a group.
- **Members**: view members; add a member by email (`add_group_member_by_email` RPC);
  remove (self, or anyone if you're the creator).
- **Expenses**:
  - Create with split type **equal / exact / percentage / shares**, with a live
    preview and inline validation before save.
  - **Edit** an existing expense (re-hydrates the original split from `split_value`).
  - **Delete** (with confirm dialog; participants cascade-delete).
  - **Detail screen** showing amount, payer, split type, per-person breakdown
    (with %/shares labels), created/edited timestamps.
- **Settlements**: record a payment between any two members; suggested payments
  prefilled from the greedy settle-up algorithm; tap a suggestion to fill the form.
- **Balances**: per-member net, shown on the group screen, derived at read time.
- **Activity feed**: merged, newest-first feed of expenses (with "edited" marker),
  settlements (with "logged by" when a third party recorded it), and member joins.
- **Group summary**: total spent, expense count, total settled (on the group screen).

UI conventions: brand color `#1d9e75` (green); modals for create/edit/settle/add-member
flows; `useFocusEffect` to refetch on screen focus; `KeyboardAvoidingView` on forms.

---

## 8. Completed phases

- **Phase 0 — Profiles & auth** (`20260610000002_profiles_auth.sql`): profiles
  table, signup trigger, own-row RLS, `set_updated_at`.
- **Initial schema** (`20260610125610_initial_schema.sql`): groups, group_members,
  expenses, and the (currently unused) AI-itemization + group-memory tables; RLS
  enabled but **no policies yet** (fully locked).
- **Phase 1 — Groups, expenses, splits, settlements, RLS**
  (`20260615000001_phase1_groups_expenses.sql`): added `expense_participants` and
  `settlements`; membership helpers; the full RLS policy set; widened profile
  visibility to co-members; `add_group_member_by_email` RPC. App could create
  equal-split expenses and record payer-only settlements.
- **Phase 2 — Complete the expense workflow** (`20260615000002_…`): split-input
  persistence (`split_value`), `expenses.updated_at` + trigger, `settlements.recorded_by`
  + relaxed insert policy, the transactional `save_expense` RPC. App gained all four
  split types, expense edit/delete, expense detail screen, third-party settlements,
  the activity feed, and summary stats. **Migration is applied to the remote DB and
  local/remote migration lists are in sync.**

---

## 9. Future roadmap (not built — candidates, in rough priority order)

These are explicitly **out of current scope** but the schema/scaffold anticipates some:

- **Group/expense lifecycle gaps flagged by `TODO(phase-next)` in Phase 1 SQL:**
  - `groups` DELETE policy (owner-only) + archive flow.
  - `group_members` role changes (promote/demote) via an UPDATE policy.
- **AI receipt itemization** (the dormant `expense_items` / `item_shares` tables and
  `services/ai-service/`): OCR a receipt → line items → per-person item shares.
- **Group memory / preferences** (`group_memories` + `vector(1536)` embeddings,
  `memory_retrieval_logs`, `memory_suggestions`): remember things like "Alice is
  vegetarian" to suggest splits.
- **Generated DB types**: replace the hand-written `lib/types.ts` /
  `lib/database.types.ts` with `supabase gen types typescript`.
- **Multi-currency** display/conversion, **recurring expenses**, **realtime**, **push
  notifications** — all currently and deliberately excluded.

### Explicit non-goals (do not add without a product decision)
Realtime subscriptions, notifications, OCR/AI, currency conversion, recurring
expenses. The Phase 2 brief called these out as out of scope; keep the core
Splitwise workflow tight before expanding.

---

## 10. Important design decisions (quick reference)

1. **Never store balances** — always derive from expenses + participants +
   settlements. (`lib/balances.ts`)
2. **Integer-cents math everywhere**; remainders distributed deterministically so
   splits sum exactly. (`lib/splits.ts`, `lib/balances.ts`)
3. **`share_amount` is the source of truth; `split_value` is only for re-hydrating
   the edit form.** Equal splits store `split_value = null`.
4. **All expense writes go through the transactional `save_expense` RPC** — no more
   two-write hazard.
5. **RLS is the security boundary**; SECURITY DEFINER helpers exist only to keep
   policies simple and recursion-free. App-side checks are UX, not security.
6. **Settlements decouple "who paid" from "who recorded it"** (`recorded_by`), but
   `recorded_by` never affects balances.
7. **Screens are dumb; logic is pure and testable; repositories are thin.**
8. **Types are hand-maintained in lockstep with migrations** (until generated types
   are wired up) — when you change a migration, update `lib/types.ts` and
   `lib/database.types.ts`.

---

## 11. Common commands

All app commands run from `apps/mobile/`; all DB commands from the repo root
(where `supabase/` lives).

### Mobile app
```bash
cd apps/mobile
npm install
npx expo start            # dev server (press i / a / w for iOS / Android / web)
npm run ios               # = expo start --ios
npm run android           # = expo start --android
npx tsc --noEmit          # typecheck (must be clean before commit)
```

Requires `apps/mobile/.env` with:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```
(`lib/supabase.ts` throws on startup if these are missing. Copy from
`apps/mobile/.env.example`.)

### Supabase / database
```bash
# Local stack (needs Docker running):
npx supabase start
npx supabase stop
npx supabase status

# Migrations:
npx supabase migration list          # compare local vs remote applied migrations
npx supabase db reset                # rebuild local DB from migrations (DESTRUCTIVE, local)
npx supabase db push                 # apply pending migrations to the LINKED REMOTE project
echo "Y" | npx supabase db push      # non-interactive confirm

# Regenerate types (future — not yet adopted):
npx supabase gen types typescript --local > apps/mobile/lib/database.types.ts
```

> **Gotcha learned in Phase 2:** `grant`/`drop` on an overloaded function must match
> the **exact** argument-type signature. `save_expense` has two `text` params; the
> correct signature is `(uuid, uuid, uuid, text, numeric, text, text, jsonb)`. A
> mismatched `grant` aborts (and rolls back) the whole migration with
> `function ... does not exist (SQLSTATE 42883)`.

---

## 12. Conventions for contributors / agents

- **Read versioned Expo docs** (SDK 54) before writing RN code; APIs drift.
- **Don't bypass the layering**: UI → repositories → supabase. Keep math in
  `lib/*.ts` pure.
- **When you touch the schema**: add a new timestamped migration (don't edit applied
  ones), then update `lib/types.ts` and `lib/database.types.ts` by hand to match,
  then `npx tsc --noEmit`.
- **Money is cents**: never do float arithmetic on amounts; reuse `toCents`/`fromCents`
  patterns and the existing distribution helpers.
- **RLS first**: any new table needs RLS enabled and policies scoped via
  `is_group_member()`; prefer SECURITY INVOKER for RPCs and add explicit checks only
  for clearer errors.
- **Relative import depth matters** in the nested route folders, e.g.
  `groups/[id]/expenses/[expenseId].tsx` reaches `lib/` via `../../../../../lib/...`.

# SplitSmart — Phase 0 setup & test guide

Goal: auth works end-to-end in Expo with local Supabase. Nothing else.

---

## 1. Package assumptions

Expo SDK 53+ with Expo Router v5 (the default `create-expo-app` template).

If `apps/mobile` doesn't exist yet, from the repo root:

```bash
npx create-expo-app@latest apps/mobile
cd apps/mobile
npm run reset-project        # strips the example screens; delete app-example/ if it remains
```

Then install Phase 0 dependencies (from `apps/mobile`):

```bash
npx expo install @react-native-async-storage/async-storage
npm install @supabase/supabase-js react-native-url-polyfill
```

Everything else (expo-router, react-native-screens, safe-area-context,
expo-linking, expo-constants) ships with the template. `package.json`
must contain `"main": "expo-router/entry"` — the template sets this.

## 2. File placement

```
apps/mobile/
├── app.json                      # replace with the provided one (keep your icons/splash keys if any)
├── .env                          # copy from .env.example, fill values — gitignore this
├── .env.example
├── app/
│   ├── _layout.tsx               # root: AuthProvider + session gate
│   ├── (auth)/
│   │   ├── _layout.tsx           # redirects signed-in users to "/"
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (app)/
│       ├── _layout.tsx           # redirects signed-out users to "/login"
│       └── index.tsx             # home screen
└── lib/
    ├── supabase.ts
    ├── auth-context.tsx
    └── profile.ts

supabase/
└── migrations/
    └── 20260610000002_profiles_auth.sql
```

Delete any template `app/index.tsx` at the app root — the only index
lives inside `(app)/`.

## 3. Environment variables

`apps/mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
```

- iOS simulator: `127.0.0.1` works as-is.
- Android emulator: use `http://10.0.2.2:54321`.
- Physical device via Expo Go: use your machine's LAN IP
  (e.g. `http://192.168.1.5:54321`) and make sure phone + laptop share a network.

Add `.env` to `.gitignore`. Restart `expo start` with `-c` after editing
`.env` (env vars are inlined at bundle time).

## 4. Local Supabase

From the repo root:

```bash
supabase start          # boots local stack
supabase status         # copy API URL + anon key into .env
supabase db reset       # applies all migrations to a clean local DB
```

Email confirmation: for the fastest loop, ensure `supabase/config.toml` has

```toml
[auth.email]
enable_confirmations = false
```

then `supabase stop && supabase start`. If you leave confirmations ON,
signup shows "Check your email" — open Mailpit at http://127.0.0.1:54324
and click the confirmation link, then sign in.

## 5. Run

```bash
cd apps/mobile
npx expo start -c
```

## 6. Auth test checklist

1. **Signup** — Create account as `alice@test.com` / `password123`,
   display name "Alice". App should land on the home screen showing
   "Hi, Alice" and the email. (With confirmations on: confirm via
   Mailpit first, then sign in.)
2. **Profile row created by trigger** — Open Supabase Studio
   (http://127.0.0.1:54323) → Table Editor → `profiles`. Exactly one
   row for Alice with `display_name = 'Alice'`.
3. **Session persistence** — Kill the app completely (or stop and
   restart `expo start`). Reopen: brief spinner, then home screen.
   No login prompt.
4. **Sign out** — Tap "Sign out" → you land on the login screen.
   Relaunch the app: still on login (session cleared from storage).
5. **Login** — Sign back in as Alice. Home screen, "Hi, Alice".
6. **Route protection (out)** — While signed out, try deep links
   `splitsmart:///` — you should be redirected to login.
7. **Route protection (in)** — While signed in, navigating to
   `/login` redirects back to home.
8. **RLS spot check** — Sign up a second user `bob@test.com` on the
   home screen Bob sees only his own name. Then in Studio's SQL editor:

   ```sql
   -- run as anon/authenticated via the API instead for a true test,
   -- but a quick proxy: count rows visible to each user
   select id, display_name from public.profiles;
   ```

   Studio uses the service role and shows both rows — that's expected.
   The real check: Alice's app never shows Bob's data, and the
   `profiles_select_own` policy guarantees a `.select()` from the app
   returns only the caller's row. You can verify with curl:

   ```bash
   curl "http://127.0.0.1:54321/rest/v1/profiles?select=*" \
     -H "apikey: <anon-key>" \
     -H "Authorization: Bearer <alice-access-token>"
   # → exactly one row (Alice's)
   ```

   (Grab an access token by logging `session.access_token` once, or from
   the auth response in the network inspector.)
9. **Error states** — Wrong password on login shows the error inline;
   signup with an existing email shows Supabase's error message.

If all nine pass, Phase 0 is done and the schema work for groups,
expenses, and memory tables (Phase 1) starts from a verified base.

## 7. Notes & deliberate choices

- **AsyncStorage for tokens** matches the official Supabase RN guide and
  is fine for v1. If an interviewer asks about hardening: swap the
  `storage` adapter for one backed by `expo-secure-store` (chunked,
  since SecureStore has a 2KB value limit) — it's a one-file change in
  `lib/supabase.ts` because the storage interface is pluggable.
- **Trigger-first profile creation** (DB trigger) with a client-side
  idempotent upsert as a safety net. The DB is the authority; the
  client never assumes.
- **Redirects live in route-group layouts**, not in individual screens,
  so no screen can be reached unprotected by accident as the app grows.

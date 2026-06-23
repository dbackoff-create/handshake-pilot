# Handshake — Pilot Data Layer

This adds the **request/hold data layer** on top of the existing scaffold: the
real propose → counter → confirm → lock lifecycle, backed by Supabase, with the
72-hour pending-state hold enforced in Postgres.

## What's new in this drop

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Row types matching the schema (+ `requesting_team_is_home`). |
| `src/lib/scheduling.ts` | Pure logic, now **hold-aware**. Original `canConfirmGame` etc. preserved; adds `hasHoldConflict`, `dateStatus`, `buildMonthStatuses`, `haversineMiles`. |
| `src/lib/queries.ts` | Supabase reads/writes: directory, blackouts, confirmed games, active holds, active requests, history, and lifecycle writes. |
| `supabase/holds.sql` | The enforcement layer — `active_holds` view, hold-guard index, `expire_stale_requests()`, and the atomic `confirm_game_request()` RPC. |

## Setup

1. Create a Supabase project. In the SQL editor, run **`schema.sql` first**, then **`holds.sql`**.
2. Copy `.env.example` → `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. `npm install` then `npm run dev`.

## The lifecycle, end to end

```
sendProposal()      -> inserts game_request (status 'proposed', expires_at = now()+72h)
                       => row appears in active_holds, reserving the date for BOTH teams
counterProposal()   -> status 'countered', hold moves to counter_date, fresh 72h window
confirmRequest()    -> RPC confirm_game_request(): re-checks blackouts + confirmed games
                       for both teams inside one transaction, writes games row, status 'confirmed'
declineRequest()    -> status 'rejected'   (hold released)
releaseHold()       -> status 'cancelled'  (your own pending hold)
expireStaleRequests() -> flips past-expiry holds to 'expired'
```

## Why the hold is enforced in Postgres, not just the UI

The original `scheduling.ts` only blocked blackouts and *confirmed* games, so two
coaches could both propose and both confirm the same date. The fix is two-layer:

- **Read path:** `getActiveHolds()` feeds `dateStatus()`, so a held date renders as
  unavailable on every coach's calendar (the "Held elsewhere" state in the prototype).
- **Write path:** `confirm_game_request()` locks the request row and re-validates
  inside a transaction, so two simultaneous confirms cannot both win. This is the
  race-safe version of the prototype's conflict-prevention behavior — and the
  database-level substance behind the Tier 1 IP claims.

## How the prototype maps onto this

The in-chat React prototype is the design reference. Each piece has a 1:1 home here:

| Prototype | Pilot |
|-----------|-------|
| In-memory `proposals` keyed by team | `game_requests` rows + `getActiveRequestsForTeam()` |
| `buildHeldDates()` / "Held elsewhere" cells | `active_holds` view + `dateStatus()` |
| 72h countdown | `expires_at` column; `expireStaleRequests()` + UI ticker |
| "Send Handshake" | `sendProposal()` |
| "Lock Game" | `confirmRequest()` (RPC) |
| Requests → History (Confirmed/Declined/Expired/Released) | `getRequestHistoryForTeam()` |
| Month navigation | client-only; fetch blackouts/games for the visible range |

## Next wiring steps (UI)

1. Resolve the signed-in coach's team (`getMyTeams`) and pick an active team.
2. On the Schedule screen, for a selected opponent, fetch blackouts (both teams),
   confirmed games, and active holds for the visible month → `buildMonthStatuses()`.
3. Overlay the pair's own active request (pending/countered) on top.
4. Wire the buttons to the lifecycle functions; call `subscribeToScheduling()` so
   both coaches' calendars update live.
5. Call `expireStaleRequests()` on load; optionally enable `pg_cron` (see holds.sql).

---

## Auth + setup (added)

New files: `tsconfig.json`, `next.config.mjs`, `postcss.config.js`, pinned
`package.json`, `src/lib/auth.ts`, `src/lib/useAuth.tsx`, `src/app/login/page.tsx`,
`src/app/NavBar.tsx`, `supabase/auth.sql`, `supabase/seed.sql`.

### Run order in the Supabase SQL editor
1. `schema.sql`
2. `holds.sql`
3. `auth.sql`   (unique coach constraint + tighter RLS)
4. `seed.sql`   (verified pilot teams + blackouts + one locked game)

### App
```
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npm run typecheck            # tsc --noEmit against real types
npm run dev
```

### Auth flow
- `/login` sends a Supabase magic link.
- On return, `AuthProvider` calls `ensureCoachRecord()` (creates a `coaches` row
  on first sign-in) and loads the coach's teams via `team_coaches`.
- The Schedule page resolves **My team** from the signed-in coach. To attach
  yourself to a team for testing, run the snippet at the bottom of `seed.sql`
  with your email after first login.

### Still open (see chat "next steps")
- Wire Requests / Season / Dashboard / Profile screens (functions already in `queries.ts`).
- Notifications + reminders (the `notifications` table is unused so far).
- End-to-end test against a live project, then deploy to Vercel + Supabase.

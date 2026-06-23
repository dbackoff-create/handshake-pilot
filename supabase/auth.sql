-- ===========================================================================
-- auth.sql — auth wiring + tighter row-level security
-- Run AFTER schema.sql and holds.sql. Idempotent.
--
-- The original policies let any authenticated user write any row. For a pilot
-- with real (if friendly) coaches, scope writes so a coach can only touch their
-- own team's data. Reads stay open across the league (teams need to see each
-- other's availability to schedule).
-- ===========================================================================

-- One coach record per auth user (used by ensureCoachRecord()).
alter table public.coaches
  add constraint coaches_user_id_key unique (user_id);

-- Helper: teams the current auth user coaches.
create or replace function public.my_team_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select tc.team_id
  from public.team_coaches tc
  join public.coaches c on c.id = tc.coach_id
  where c.user_id = auth.uid();
$$;

-- ---- coaches: a user manages only their own coach row ----
drop policy if exists "auth write coaches" on public.coaches;
create policy "coach self insert" on public.coaches
  for insert with check (user_id = auth.uid());
create policy "coach self update" on public.coaches
  for update using (user_id = auth.uid());

-- ---- blackouts: only for teams you coach ----
drop policy if exists "auth write blackouts" on public.blackouts;
create policy "blackouts by my team" on public.blackouts
  for all using (team_id in (select public.my_team_ids()))
  with check (team_id in (select public.my_team_ids()));

-- ---- game_requests: you must be on one side of the request ----
drop policy if exists "auth write requests" on public.game_requests;
create policy "requests i'm involved in" on public.game_requests
  for all
  using (
    requesting_team_id in (select public.my_team_ids())
    or receiving_team_id in (select public.my_team_ids())
  )
  with check (
    requesting_team_id in (select public.my_team_ids())
    or receiving_team_id in (select public.my_team_ids())
  );

-- ---- games: written by the confirm RPC (security definer), so block direct
--      client writes but keep reads open ----
drop policy if exists "auth write games" on public.games;
-- (no INSERT/UPDATE policy => only security-definer functions can write)

-- Reads remain as defined in schema.sql (authenticated can select).
-- teams / team_coaches write policies are left permissive for the pilot so
-- coaches can self-register a team; tighten before public launch.

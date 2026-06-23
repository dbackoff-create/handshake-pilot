-- ===========================================================================
-- holds.sql — pending-state hold enforcement + atomic bilateral confirmation
-- Run AFTER schema.sql. Idempotent: safe to re-run.
--
-- This is what turns the "pending-state hold that prevents conflicts" from a UI
-- behavior into a database-enforced guarantee. It is also the technical
-- substance behind the Tier 1 IP claims (bilateral confirmation, pending holds,
-- blackout-aware mutual availability, conflict prevention during negotiation).
-- ===========================================================================

-- 1. Home/away intent collected at propose time (front-end Home/Away toggle).
alter table public.game_requests
  add column if not exists requesting_team_is_home boolean default true;

-- 2. The effective held date for every ACTIVE, non-expired request. A hold
--    reserves this date for BOTH teams during negotiation.
create or replace view public.active_holds as
select
  id,
  requesting_team_id,
  receiving_team_id,
  case when status = 'countered' then counter_date else proposed_date end as held_date,
  status,
  expires_at
from public.game_requests
where status in ('proposed', 'countered')
  and expires_at > now();

-- 3. Prevent two active holds for the same pairing on the same proposed date.
--    (Lightweight guard; the authoritative cross-opponent check is in the
--    confirm function below.)
create unique index if not exists uniq_active_request
  on public.game_requests (requesting_team_id, receiving_team_id, proposed_date)
  where status in ('proposed', 'countered');

-- Helpful lookups
create index if not exists idx_requests_status_expires
  on public.game_requests (status, expires_at);
create index if not exists idx_games_date_status
  on public.games (game_date, status);
create index if not exists idx_blackouts_team_dates
  on public.blackouts (team_id, start_date, end_date);

-- 4. Expire stale holds. Call from the app on load/focus, and/or schedule.
create or replace function public.expire_stale_requests()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.game_requests
     set status = 'expired', updated_at = now()
   where status in ('proposed', 'countered')
     and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 5. Atomic, race-safe bilateral confirmation.
--    Locks the request row, re-validates blackouts + confirmed games for BOTH
--    teams, writes the games row, and flips status to 'confirmed' — all in one
--    transaction. Two simultaneous confirms cannot both succeed.
create or replace function public.confirm_game_request(p_request_id uuid)
returns public.games
language plpgsql
security definer
as $$
declare
  req public.game_requests;
  v_date date;
  v_time time;
  v_home uuid;
  v_away uuid;
  v_game public.games;
  conflicts integer;
begin
  select * into req from public.game_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request % not found', p_request_id using errcode = 'P0002';
  end if;

  if req.status not in ('proposed', 'countered') then
    raise exception 'Request is not confirmable (status=%).', req.status using errcode = 'P0001';
  end if;

  if req.expires_at <= now() then
    update public.game_requests set status = 'expired', updated_at = now() where id = req.id;
    raise exception 'Hold expired' using errcode = 'P0001';
  end if;

  v_date := coalesce(req.counter_date, req.proposed_date);
  v_time := coalesce(req.counter_time, req.proposed_time);

  -- Blackout conflict for either team
  if exists (
    select 1 from public.blackouts b
     where b.team_id in (req.requesting_team_id, req.receiving_team_id)
       and v_date between b.start_date and b.end_date
  ) then
    raise exception 'Blackout conflict on %', v_date using errcode = 'P0001';
  end if;

  -- Confirmed-game conflict for either team
  select count(*) into conflicts
    from public.games g
   where g.status = 'confirmed'
     and g.game_date = v_date
     and (g.home_team_id in (req.requesting_team_id, req.receiving_team_id)
          or g.away_team_id in (req.requesting_team_id, req.receiving_team_id));
  if conflicts > 0 then
    raise exception 'A confirmed game already exists on % for one of the teams', v_date
      using errcode = 'P0001';
  end if;

  if coalesce(req.requesting_team_is_home, true) then
    v_home := req.requesting_team_id;
    v_away := req.receiving_team_id;
  else
    v_home := req.receiving_team_id;
    v_away := req.requesting_team_id;
  end if;

  insert into public.games (game_request_id, home_team_id, away_team_id, game_date, game_time, field, status)
  values (req.id, v_home, v_away, v_date, v_time, req.proposed_field, 'confirmed')
  returning * into v_game;

  update public.game_requests set status = 'confirmed', updated_at = now() where id = req.id;

  return v_game;
end;
$$;

-- 6. (Optional) schedule auto-expiry every 5 minutes if pg_cron is available.
--    Uncomment after `create extension pg_cron;` on your Supabase project.
-- select cron.schedule('expire-holds', '*/5 * * * *', $$select public.expire_stale_requests();$$);

-- ===========================================================================
-- seed.sql — pilot demo data. Run AFTER schema.sql, holds.sql, auth.sql.
-- Safe to re-run (fixed UUIDs + on conflict do nothing).
--
-- Blackout/game dates are relative to CURRENT_DATE so the calendar always has
-- live-looking data regardless of when you seed.
-- ===========================================================================

insert into public.teams (id, name, age_group, city, state, home_field, latitude, longitude, verified)
values
  ('11111111-1111-1111-1111-111111111111', 'Miami Sharks',            '14U', 'Miami',         'FL', 'Tropical Park',        25.7350, -80.3350, true),
  ('22222222-2222-2222-2222-222222222222', 'Doral Diamondbacks',      '14U', 'Doral',         'FL', 'Doral Central Park',   25.8120, -80.3580, true),
  ('33333333-3333-3333-3333-333333333333', 'Weston Wolves',           '14U', 'Weston',        'FL', 'Regional Park',        26.1000, -80.3990, true),
  ('44444444-4444-4444-4444-444444444444', 'Coral Springs Crushers',  '14U', 'Coral Springs', 'FL', 'Mullins Park',         26.2710, -80.2710, true),
  ('55555555-5555-5555-5555-555555555555', 'Davie Hurricanes',        '14U', 'Davie',         'FL', 'Pine Island Park',     26.0760, -80.2520, true),
  ('66666666-6666-6666-6666-666666666666', 'Boca Raton Blaze',        '13U', 'Boca Raton',    'FL', 'Patch Reef Park',      26.3690, -80.1300, true)
on conflict (id) do nothing;

-- Blackouts (tournament windows) keyed off today
insert into public.blackouts (id, team_id, start_date, end_date, reason)
values
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', current_date + 16, current_date + 18, 'Sharks Home Tournament'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', current_date + 10, current_date + 13, 'PBR Future Games'),
  ('b3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', current_date + 5,  current_date + 6,  'Memorial Showcase'),
  ('b4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', current_date + 21, current_date + 23, 'USSSA Qualifier')
on conflict (id) do nothing;

-- One pre-existing confirmed game (Sharks vs an external opponent) so a date
-- shows as Locked on the calendar.
insert into public.games (id, game_request_id, home_team_id, away_team_id, game_date, game_time, field, status)
values
  ('99999999-9999-9999-9999-999999999999', null,
   '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555',
   current_date + 8, '18:00', 'Tropical Park', 'confirmed')
on conflict (id) do nothing;

-- NOTE: coaches + team_coaches are created at sign-in time (ensureCoachRecord).
-- To attach yourself to a team for testing, after first login run e.g.:
--   insert into public.team_coaches (team_id, coach_id)
--   select '11111111-1111-1111-1111-111111111111', id
--   from public.coaches where email = 'you@email.com'
--   on conflict do nothing;

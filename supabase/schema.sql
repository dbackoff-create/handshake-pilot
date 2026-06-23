create extension if not exists "uuid-ossp";

create table public.coaches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamp with time zone default now()
);

create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  age_group text not null,
  city text not null,
  state text not null default 'FL',
  home_field text,
  latitude numeric,
  longitude numeric,
  created_by uuid references public.coaches(id),
  verified boolean default false,
  created_at timestamp with time zone default now()
);

create table public.team_coaches (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references public.teams(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete cascade,
  role text default 'coach',
  created_at timestamp with time zone default now(),
  unique(team_id, coach_id)
);

create table public.blackouts (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references public.teams(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamp with time zone default now()
);

create type game_request_status as enum (
  'proposed',
  'countered',
  'confirmed',
  'rejected',
  'expired',
  'cancelled'
);

create table public.game_requests (
  id uuid primary key default uuid_generate_v4(),
  requesting_team_id uuid references public.teams(id) on delete cascade,
  receiving_team_id uuid references public.teams(id) on delete cascade,
  proposed_date date not null,
  proposed_time time,
  proposed_field text,
  note text,
  status game_request_status default 'proposed',
  counter_date date,
  counter_time time,
  counter_note text,
  expires_at timestamp with time zone default (now() + interval '72 hours'),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.games (
  id uuid primary key default uuid_generate_v4(),
  game_request_id uuid references public.game_requests(id),
  home_team_id uuid references public.teams(id),
  away_team_id uuid references public.teams(id),
  game_date date not null,
  game_time time,
  field text,
  status text default 'confirmed',
  created_at timestamp with time zone default now()
);

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  coach_id uuid references public.coaches(id) on delete cascade,
  title text not null,
  body text,
  read boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.coaches enable row level security;
alter table public.teams enable row level security;
alter table public.team_coaches enable row level security;
alter table public.blackouts enable row level security;
alter table public.game_requests enable row level security;
alter table public.games enable row level security;
alter table public.notifications enable row level security;

create policy "auth read coaches" on public.coaches for select using (auth.role() = 'authenticated');
create policy "auth write coaches" on public.coaches for all using (auth.role() = 'authenticated');

create policy "auth read teams" on public.teams for select using (auth.role() = 'authenticated');
create policy "auth write teams" on public.teams for all using (auth.role() = 'authenticated');

create policy "auth read team coaches" on public.team_coaches for select using (auth.role() = 'authenticated');
create policy "auth write team coaches" on public.team_coaches for all using (auth.role() = 'authenticated');

create policy "auth read blackouts" on public.blackouts for select using (auth.role() = 'authenticated');
create policy "auth write blackouts" on public.blackouts for all using (auth.role() = 'authenticated');

create policy "auth read requests" on public.game_requests for select using (auth.role() = 'authenticated');
create policy "auth write requests" on public.game_requests for all using (auth.role() = 'authenticated');

create policy "auth read games" on public.games for select using (auth.role() = 'authenticated');
create policy "auth write games" on public.games for all using (auth.role() = 'authenticated');

create policy "auth read notifications" on public.notifications for select using (auth.role() = 'authenticated');
create policy "auth write notifications" on public.notifications for all using (auth.role() = 'authenticated');

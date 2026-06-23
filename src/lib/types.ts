// Row types mirroring supabase/schema.sql (plus the requesting_team_is_home
// column added in supabase/holds.sql). Dates are 'YYYY-MM-DD', times are 24h
// 'HH:MM' or 'HH:MM:SS' as returned by Postgres `time`.

export type GameRequestStatus =
  | 'proposed'
  | 'countered'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface Team {
  id: string;
  name: string;
  age_group: string;
  city: string;
  state: string;
  home_field: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string | null;
  verified: boolean;
  created_at: string;
}

export interface Blackout {
  id: string;
  team_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

export interface GameRequest {
  id: string;
  requesting_team_id: string;
  receiving_team_id: string;
  proposed_date: string;
  proposed_time: string | null;
  proposed_field: string | null;
  note: string | null;
  status: GameRequestStatus;
  counter_date: string | null;
  counter_time: string | null;
  counter_note: string | null;
  requesting_team_is_home: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  game_request_id: string | null;
  home_team_id: string;
  away_team_id: string;
  game_date: string;
  game_time: string | null;
  field: string | null;
  status: string;
  created_at: string;
}

// Row from the active_holds view (supabase/holds.sql)
export interface ActiveHold {
  id: string;
  requesting_team_id: string;
  receiving_team_id: string;
  held_date: string;
  status: GameRequestStatus;
  expires_at: string;
}

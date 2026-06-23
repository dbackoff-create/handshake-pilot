// Data-access layer over Supabase. All reads/writes for the scheduling flow
// live here so UI components stay thin. The authoritative conflict check for
// confirmation happens server-side via the confirm_game_request() RPC
// (see supabase/holds.sql) — these client calls are the convenience layer.

import { supabase } from './supabaseClient';
import type {
  Team,
  Blackout,
  Game,
  GameRequest,
  ActiveHold,
} from './types';
import {
  haversineMiles,
  type DateRange,
  type ConfirmedGame,
  type Hold,
} from './scheduling';

/* ------------------------------------------------------------------ */
/* Directory                                                           */
/* ------------------------------------------------------------------ */

export async function getVerifiedTeams(opts?: { ageGroup?: string }): Promise<Team[]> {
  let q = supabase.from('teams').select('*').eq('verified', true).order('name');
  if (opts?.ageGroup) q = q.eq('age_group', opts.ageGroup);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getMyTeams(coachId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('team_coaches')
    .select('team:teams(*)')
    .eq('coach_id', coachId);
  if (error) throw error;
  // supabase returns [{ team: {...} }]
  return (data ?? []).map((r: any) => r.team).filter(Boolean);
}

// Directory rows decorated with distance from the viewing team.
export type DirectoryTeam = Team & { distanceMiles: number | null };

export function decorateWithDistance(teams: Team[], origin: Team): DirectoryTeam[] {
  return teams
    .filter((t) => t.id !== origin.id)
    .map((t) => {
      const distanceMiles =
        origin.latitude != null &&
        origin.longitude != null &&
        t.latitude != null &&
        t.longitude != null
          ? haversineMiles(origin.latitude, origin.longitude, t.latitude, t.longitude)
          : null;
      return { ...t, distanceMiles };
    })
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}

/* ------------------------------------------------------------------ */
/* Availability inputs (blackouts, confirmed games, holds)             */
/* ------------------------------------------------------------------ */

export async function getBlackouts(teamId: string): Promise<DateRange[]> {
  const { data, error } = await supabase
    .from('blackouts')
    .select('start_date, end_date')
    .eq('team_id', teamId);
  if (error) throw error;
  return (data ?? []) as DateRange[];
}

export async function getTeamBlackoutRows(teamId: string): Promise<Blackout[]> {
  const { data, error } = await supabase
    .from('blackouts')
    .select('*')
    .eq('team_id', teamId)
    .order('start_date');
  if (error) throw error;
  return data ?? [];
}

// Confirmed games within a date window, expanded to one ConfirmedGame row per
// team per game (so both home and away teams register the conflict).
export async function getConfirmedGames(
  range: { from: string; to: string },
  teamIds?: string[]
): Promise<{ flat: ConfirmedGame[]; opponentByDate: Record<string, string> }> {
  let q = supabase
    .from('games')
    .select('id, home_team_id, away_team_id, game_date, status')
    .eq('status', 'confirmed')
    .gte('game_date', range.from)
    .lte('game_date', range.to);
  if (teamIds && teamIds.length) {
    const list = `(${teamIds.join(',')})`;
    q = q.or(`home_team_id.in.${list},away_team_id.in.${list}`);
  }
  const { data, error } = await q;
  if (error) throw error;

  const flat: ConfirmedGame[] = [];
  const opponentByDate: Record<string, string> = {};
  for (const g of data ?? []) {
    flat.push({ team_id: g.home_team_id, game_date: g.game_date });
    flat.push({ team_id: g.away_team_id, game_date: g.game_date });
  }
  return { flat, opponentByDate };
}

// All active (non-expired) holds across the league, from the active_holds view.
export async function getActiveHolds(): Promise<Hold[]> {
  const { data, error } = await supabase
    .from('active_holds')
    .select('id, requesting_team_id, receiving_team_id, held_date');
  if (error) throw error;
  return (data ?? []) as Hold[];
}

/* ------------------------------------------------------------------ */
/* Requests: active + history                                          */
/* ------------------------------------------------------------------ */

const ACTIVE = ['proposed', 'countered'];
const CLOSED = ['confirmed', 'rejected', 'expired', 'cancelled'];

export async function getActiveRequestsForTeam(teamId: string): Promise<GameRequest[]> {
  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .in('status', ACTIVE)
    .gt('expires_at', new Date().toISOString())
    .or(`requesting_team_id.eq.${teamId},receiving_team_id.eq.${teamId}`)
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type HistoryOutcome = 'confirmed' | 'declined' | 'expired' | 'released';

export interface HistoryItem {
  id: string;
  opponentTeamId: string;
  date: string;
  time: string | null;
  outcome: HistoryOutcome;
  at: string;
}

function outcomeFromStatus(s: string): HistoryOutcome {
  switch (s) {
    case 'confirmed':
      return 'confirmed';
    case 'rejected':
      return 'declined';
    case 'expired':
      return 'expired';
    default:
      return 'released'; // cancelled
  }
}

export async function getRequestHistoryForTeam(
  teamId: string,
  limit = 50
): Promise<HistoryItem[]> {
  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .in('status', CLOSED)
    .or(`requesting_team_id.eq.${teamId},receiving_team_id.eq.${teamId}`)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: GameRequest) => {
    const effDate = r.status === 'confirmed' && r.counter_date ? r.counter_date : r.proposed_date;
    const effTime = r.status === 'confirmed' && r.counter_time ? r.counter_time : r.proposed_time;
    return {
      id: r.id,
      opponentTeamId: r.requesting_team_id === teamId ? r.receiving_team_id : r.requesting_team_id,
      date: r.counter_date && r.status === 'countered' ? r.counter_date : effDate,
      time: effTime,
      outcome: outcomeFromStatus(r.status),
      at: r.updated_at,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle writes                                                    */
/* ------------------------------------------------------------------ */

export async function sendProposal(input: {
  requestingTeamId: string;
  receivingTeamId: string;
  date: string;
  time?: string | null;
  isHome?: boolean;
  field?: string | null;
  note?: string | null;
}): Promise<GameRequest> {
  const { data, error } = await supabase
    .from('game_requests')
    .insert({
      requesting_team_id: input.requestingTeamId,
      receiving_team_id: input.receivingTeamId,
      proposed_date: input.date,
      proposed_time: input.time ?? null,
      proposed_field: input.field ?? null,
      requesting_team_is_home: input.isHome ?? true,
      note: input.note ?? null,
      status: 'proposed',
      // expires_at defaults to now() + 72h in the schema
    })
    .select('*')
    .single();
  if (error) throw error; // unique index uniq_active_request blocks duplicate active holds
  return data as GameRequest;
}

export async function counterProposal(input: {
  requestId: string;
  counterDate: string;
  counterTime?: string | null;
  counterNote?: string | null;
}): Promise<GameRequest> {
  const expires = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('game_requests')
    .update({
      status: 'countered',
      counter_date: input.counterDate,
      counter_time: input.counterTime ?? null,
      counter_note: input.counterNote ?? null,
      expires_at: expires, // hold moves to the counter date, fresh 72h window
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.requestId)
    .select('*')
    .single();
  if (error) throw error;
  return data as GameRequest;
}

// Atomic, race-safe confirm. Re-validates blackouts/confirmed-games/holds inside
// a single transaction and writes the games row + flips status to confirmed.
export async function confirmRequest(requestId: string): Promise<Game> {
  const { data, error } = await supabase.rpc('confirm_game_request', {
    p_request_id: requestId,
  });
  if (error) throw error; // surfaces "Hold expired", "Blackout conflict", etc.
  return data as Game;
}

export async function declineRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('game_requests')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

// Releasing your own pending hold before the other side responds.
export async function releaseHold(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('game_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

// Flip any past-expiry holds to 'expired'. Safe to call on app load / focus;
// for production, also schedule via pg_cron (see holds.sql).
export async function expireStaleRequests(): Promise<number> {
  const { data, error } = await supabase.rpc('expire_stale_requests');
  if (error) throw error;
  return (data as number) ?? 0;
}

/* ------------------------------------------------------------------ */
/* Realtime: keep calendars in sync across coaches                     */
/* ------------------------------------------------------------------ */

export function subscribeToScheduling(onChange: () => void) {
  const channel = supabase
    .channel('scheduling')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_requests' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blackouts' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

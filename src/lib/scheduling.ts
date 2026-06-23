// Pure scheduling logic — no network, no Supabase. Safe to unit-test.
//
// This extends the original blackout/confirmed-game checks with HOLD AWARENESS:
// an active (non-expired) proposed/countered request reserves its effective date
// for BOTH teams involved, so the date cannot be double-booked during negotiation.
// That is the "pending-state hold" the product is built around.

export type DateRange = {
  start_date: string;
  end_date: string;
};

export type ConfirmedGame = {
  team_id: string;
  game_date: string;
};

// An active hold (from the active_holds view). held_date is the effective
// reserved date: proposed_date while 'proposed', counter_date once 'countered'.
export type Hold = {
  id: string;
  requesting_team_id: string;
  receiving_team_id: string;
  held_date: string;
};

export type DateStatus =
  | { type: 'past' }
  | { type: 'confirmed'; opponentName?: string }
  | { type: 'blackout'; whose: 'mine' | 'theirs' }
  | { type: 'held'; mine: boolean } // mine = held by one of *my* active requests
  | { type: 'offday' }
  | { type: 'open' };

/* ---------- primitive checks (original API preserved) ---------- */

export function isDateWithinRange(date: string, range: DateRange): boolean {
  const d = new Date(date);
  const start = new Date(range.start_date);
  const end = new Date(range.end_date);
  return d >= start && d <= end;
}

export function hasBlackoutConflict(date: string, blackouts: DateRange[]): boolean {
  return blackouts.some((range) => isDateWithinRange(date, range));
}

export function hasGameConflict(teamId: string, date: string, games: ConfirmedGame[]): boolean {
  return games.some((game) => game.team_id === teamId && game.game_date === date);
}

/* ---------- hold checks (new) ---------- */

// Does any active hold tie up `teamId` on `date`? A hold reserves the date for
// both the requesting and receiving team.
export function hasHoldConflict(teamId: string, date: string, holds: Hold[]): boolean {
  return holds.some(
    (h) =>
      h.held_date === date &&
      (h.requesting_team_id === teamId || h.receiving_team_id === teamId)
  );
}

// Full confirm gate, now including hold awareness. Used as the client-side
// pre-check; the authoritative version runs inside confirm_game_request() in
// Postgres so it is race-safe.
export function canConfirmGame(params: {
  date: string;
  teamAId: string;
  teamBId: string;
  teamABlackouts: DateRange[];
  teamBBlackouts: DateRange[];
  confirmedGames: ConfirmedGame[];
  holds?: Hold[];
  ignoreRequestId?: string; // exclude the request being confirmed from hold checks
}) {
  const {
    date,
    teamAId,
    teamBId,
    teamABlackouts,
    teamBBlackouts,
    confirmedGames,
    holds = [],
    ignoreRequestId,
  } = params;

  if (hasBlackoutConflict(date, teamABlackouts)) {
    return { ok: false, reason: 'Requesting team has a blackout on this date.' };
  }
  if (hasBlackoutConflict(date, teamBBlackouts)) {
    return { ok: false, reason: 'Receiving team has a blackout on this date.' };
  }
  if (hasGameConflict(teamAId, date, confirmedGames)) {
    return { ok: false, reason: 'Requesting team already has a confirmed game on this date.' };
  }
  if (hasGameConflict(teamBId, date, confirmedGames)) {
    return { ok: false, reason: 'Receiving team already has a confirmed game on this date.' };
  }

  const otherHolds = ignoreRequestId ? holds.filter((h) => h.id !== ignoreRequestId) : holds;
  if (hasHoldConflict(teamAId, date, otherHolds)) {
    return { ok: false, reason: 'Requesting team has another date on hold.' };
  }
  if (hasHoldConflict(teamBId, date, otherHolds)) {
    return { ok: false, reason: 'Receiving team has another date on hold.' };
  }

  return { ok: true, reason: null };
}

/* ---------- date helpers ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/* ---------- the engine the calendar renders from ---------- */

export type AvailabilityInputs = {
  myTeamId: string;
  opponentTeamId: string;
  myBlackouts: DateRange[];
  opponentBlackouts: DateRange[];
  confirmedGames: ConfirmedGame[]; // both teams, expanded one row per team per game
  holds: Hold[]; // all active holds across the league
  todayKey: string;
  confirmedOpponentByDate?: Record<string, string>; // dateKey -> opponent name, for tooltips
  treatMondaysAsOffday?: boolean;
};

// Status for a single date for the (myTeam vs opponentTeam) pairing, accounting
// for both teams' blackouts, confirmed games, and active holds.
export function dateStatus(dateKey: string, x: AvailabilityInputs): DateStatus {
  if (dateKey < x.todayKey) return { type: 'past' };

  const confirmedForMe = x.confirmedGames.some(
    (g) => g.team_id === x.myTeamId && g.game_date === dateKey
  );
  const confirmedForOpp = x.confirmedGames.some(
    (g) => g.team_id === x.opponentTeamId && g.game_date === dateKey
  );
  if (confirmedForMe || confirmedForOpp) {
    return { type: 'confirmed', opponentName: x.confirmedOpponentByDate?.[dateKey] };
  }

  if (hasBlackoutConflict(dateKey, x.myBlackouts)) return { type: 'blackout', whose: 'mine' };
  if (hasBlackoutConflict(dateKey, x.opponentBlackouts)) return { type: 'blackout', whose: 'theirs' };

  const mineHold = x.holds.some(
    (h) =>
      h.held_date === dateKey &&
      (h.requesting_team_id === x.myTeamId || h.receiving_team_id === x.myTeamId)
  );
  const oppHold = x.holds.some(
    (h) =>
      h.held_date === dateKey &&
      (h.requesting_team_id === x.opponentTeamId || h.receiving_team_id === x.opponentTeamId)
  );
  if (mineHold || oppHold) return { type: 'held', mine: mineHold };

  if (x.treatMondaysAsOffday && new Date(dateKey).getDay() === 1) return { type: 'offday' };

  return { type: 'open' };
}

export function buildMonthStatuses(
  year: number,
  month: number,
  x: AvailabilityInputs
): Map<string, DateStatus> {
  const map = new Map<string, DateStatus>();
  for (const d of buildMonthGrid(year, month)) {
    if (d.getMonth() !== month) continue; // only the focal month
    const key = toKey(d);
    map.set(key, dateStatus(key, x));
  }
  return map;
}

/* ---------- geo (directory distance filter) ---------- */

export function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

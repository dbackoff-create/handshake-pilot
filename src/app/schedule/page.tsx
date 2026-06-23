'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import type { Team, GameRequest } from '@/lib/types';
import {
  buildMonthGrid,
  buildMonthStatuses,
  toKey,
  type DateRange,
  type ConfirmedGame,
  type Hold,
  type DateStatus,
} from '@/lib/scheduling';
import {
  getVerifiedTeams,
  getBlackouts,
  getConfirmedGames,
  getActiveHolds,
  getActiveRequestsForTeam,
  sendProposal,
  counterProposal,
  confirmRequest,
  declineRequest,
  releaseHold,
  expireStaleRequests,
  subscribeToScheduling,
} from '@/lib/queries';

/* ---------- brand ---------- */
const NAVY = '#0B1F3A';
const BLUE = '#1897F2';
const TEAL = '#35D7C9';
const GRADIENT = 'linear-gradient(90deg,#1897F2 0%,#35D7C9 100%)';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIME_OPTIONS = [
  { value: '17:00', label: '5:00 PM' },
  { value: '17:30', label: '5:30 PM' },
  { value: '18:00', label: '6:00 PM' },
  { value: '18:30', label: '6:30 PM' },
  { value: '19:00', label: '7:00 PM' },
  { value: '19:30', label: '7:30 PM' },
];

function formatTime(t: string | null): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function effectiveDate(r: GameRequest): string {
  return r.status === 'countered' && r.counter_date ? r.counter_date : r.proposed_date;
}
function effectiveTime(r: GameRequest): string | null {
  return r.status === 'countered' ? r.counter_time : r.proposed_time;
}

type Mode = 'idle' | 'propose' | 'counter';

export default function SchedulePage() {
  const { user, myTeams, loading: authLoading } = useAuth();
  const today = useMemo(() => new Date(), []);
  const todayKey = toKey(today);

  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeamId, setMyTeamId] = useState<string>('');
  const [oppTeamId, setOppTeamId] = useState<string>('');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [statuses, setStatuses] = useState<Map<string, DateStatus>>(new Map());
  const [pairRequest, setPairRequest] = useState<GameRequest | null>(null);

  const [mode, setMode] = useState<Mode>('idle');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [proposeHome, setProposeHome] = useState(true);
  const [proposeTime, setProposeTime] = useState('18:00');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const myTeam = teams.find((t) => t.id === myTeamId) || null;
  const oppTeam = teams.find((t) => t.id === oppTeamId) || null;

  /* ---------- initial load: directory (opponents) + expire stale holds ---------- */
  useEffect(() => {
    (async () => {
      try {
        const t = await getVerifiedTeams();
        setTeams(t);
        await expireStaleRequests().catch(() => {});
      } catch (e: any) {
        setError(e.message ?? 'Failed to load teams');
      }
    })();
  }, []);

  /* ---------- my team comes from the signed-in coach ---------- */
  useEffect(() => {
    if (myTeams.length && !myTeams.some((t) => t.id === myTeamId)) {
      setMyTeamId(myTeams[0].id);
    }
  }, [myTeams, myTeamId]);

  /* ---------- default opponent to the first team that isn't mine ---------- */
  useEffect(() => {
    if (!myTeamId) return;
    if (!oppTeamId || oppTeamId === myTeamId) {
      const first = teams.find((t) => t.id !== myTeamId);
      if (first) setOppTeamId(first.id);
    }
  }, [myTeamId, oppTeamId, teams]);

  /* ---------- load a month for the selected pair ---------- */
  const loadMonth = useCallback(async () => {
    if (!myTeamId || !oppTeamId || myTeamId === oppTeamId) {
      setStatuses(new Map());
      setPairRequest(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const grid = buildMonthGrid(year, month);
      const from = toKey(grid[0]);
      const to = toKey(grid[grid.length - 1]);

      const [myBlackouts, oppBlackouts, confirmed, holds, myActive] = await Promise.all([
        getBlackouts(myTeamId) as Promise<DateRange[]>,
        getBlackouts(oppTeamId) as Promise<DateRange[]>,
        getConfirmedGames({ from, to }, [myTeamId, oppTeamId]),
        getActiveHolds() as Promise<Hold[]>,
        getActiveRequestsForTeam(myTeamId),
      ]);

      const map = buildMonthStatuses(year, month, {
        myTeamId,
        opponentTeamId: oppTeamId,
        myBlackouts,
        opponentBlackouts: oppBlackouts,
        confirmedGames: confirmed.flat as ConfirmedGame[],
        holds,
        todayKey,
      });
      setStatuses(map);

      const pair =
        myActive.find(
          (r) =>
            (r.requesting_team_id === myTeamId && r.receiving_team_id === oppTeamId) ||
            (r.requesting_team_id === oppTeamId && r.receiving_team_id === myTeamId)
        ) || null;
      setPairRequest(pair);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [myTeamId, oppTeamId, year, month, todayKey]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  /* ---------- realtime: refresh on any scheduling change ---------- */
  useEffect(() => {
    const unsub = subscribeToScheduling(() => loadMonth());
    return unsub;
  }, [loadMonth]);

  /* ---------- role helpers ---------- */
  const iAmRequester = pairRequest?.requesting_team_id === myTeamId;
  const iAmReceiver = pairRequest?.receiving_team_id === myTeamId;

  /* ---------- month nav ---------- */
  const isCurrentMonth = month === today.getMonth() && year === today.getFullYear();
  const prevMonth = () => { setSelectedDate(null); setMode('idle'); let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); };
  const nextMonth = () => { setSelectedDate(null); setMode('idle'); let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); };
  const goToday = () => { setSelectedDate(null); setMode('idle'); setMonth(today.getMonth()); setYear(today.getFullYear()); };

  /* ---------- lifecycle actions ---------- */
  const doSend = async () => {
    if (!selectedDate || !myTeam || !oppTeam) return;
    try {
      await sendProposal({
        requestingTeamId: myTeamId,
        receivingTeamId: oppTeamId,
        date: selectedDate,
        time: proposeTime,
        isHome: proposeHome,
      });
      showToast(`Handshake sent to ${oppTeam.name} — 72h hold placed`);
      setSelectedDate(null);
      setMode('idle');
      loadMonth();
    } catch (e: any) {
      showToast(e.message ?? 'Could not send — date may be held or taken');
    }
  };

  const doCounter = async (dateKey: string) => {
    if (!pairRequest) return;
    try {
      await counterProposal({ requestId: pairRequest.id, counterDate: dateKey, counterTime: pairRequest.proposed_time });
      showToast('Counter sent — hold moved to the new date');
      setMode('idle');
      loadMonth();
    } catch (e: any) {
      showToast(e.message ?? 'Could not counter');
    }
  };

  const doConfirm = async () => {
    if (!pairRequest) return;
    try {
      await confirmRequest(pairRequest.id);
      showToast('Game locked');
      loadMonth();
    } catch (e: any) {
      // server RPC raises on expired hold / blackout / confirmed-game conflict
      showToast(e.message ?? 'Could not lock — conflict detected');
      loadMonth();
    }
  };

  const doDecline = async () => {
    if (!pairRequest) return;
    try { await declineRequest(pairRequest.id); showToast('Declined'); loadMonth(); }
    catch (e: any) { showToast(e.message ?? 'Could not decline'); }
  };

  const doRelease = async () => {
    if (!pairRequest) return;
    try { await releaseHold(pairRequest.id); showToast('Hold released'); loadMonth(); }
    catch (e: any) { showToast(e.message ?? 'Could not release'); }
  };

  /* ---------- cell click ---------- */
  const onCell = (dateKey: string, inMonth: boolean) => {
    if (!inMonth) return;
    const st = statuses.get(dateKey);
    if (!st) return;
    if (mode === 'counter') {
      if (st.type === 'open') doCounter(dateKey);
      else showToast('Pick an open date to counter with');
      return;
    }
    if (st.type === 'held') { showToast('Conflict prevented — that date is on hold'); return; }
    if (st.type !== 'open') return;
    if (pairRequest) { showToast(`You already have an active handshake with ${oppTeam?.name}.`); return; }
    setSelectedDate(dateKey);
    setProposeHome(true);
    setProposeTime('18:00');
  };

  const grid = buildMonthGrid(year, month);
  const pairDate = pairRequest ? effectiveDate(pairRequest) : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="px-6 py-4" style={{ backgroundColor: NAVY }}>
        <h1 className="text-2xl font-black uppercase tracking-tight text-white">Schedule</h1>
        <p className="text-xs text-blue-200">Find dates. Lock games.</p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* auth gate */}
        {!authLoading && !user && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="font-semibold text-slate-800">Sign in to schedule games</div>
            <p className="mt-1 text-sm text-slate-500">You need an account to send and confirm handshakes.</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: GRADIENT }}>Sign in</Link>
          </div>
        )}

        {user && !authLoading && myTeams.length === 0 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your account isn&apos;t linked to a team yet. Ask an admin to add you, or attach yourself via the snippet in <code>seed.sql</code>.
          </div>
        )}

        {/* team context: my team (from auth) + opponent picker */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="mb-1 block font-semibold text-slate-700">My team</span>
            {myTeams.length > 1 ? (
              <select value={myTeamId} onChange={(e) => { setMyTeamId(e.target.value); setMode('idle'); setSelectedDate(null); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.age_group}</option>)}
              </select>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                {myTeam ? `${myTeam.name} · ${myTeam.age_group}` : '—'}
              </div>
            )}
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-slate-700">Opponent</span>
            <select value={oppTeamId} onChange={(e) => { setOppTeamId(e.target.value); setMode('idle'); setSelectedDate(null); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              {teams.filter((t) => t.id !== myTeamId).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.age_group}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* active request banner */}
        {pairRequest && (
          <div className="mb-4 rounded-xl border p-4" style={{ borderColor: pairRequest.status === 'countered' ? '#7dd3fc' : '#fcd34d', backgroundColor: pairRequest.status === 'countered' ? '#f0f9ff' : '#fffbeb' }}>
            {pairRequest.status === 'proposed' && iAmReceiver && (
              <>
                <div className="text-sm text-slate-700">
                  {oppTeam?.name} proposed <b>{effectiveDate(pairRequest)}</b> at {formatTime(pairRequest.proposed_time)}. Date is on hold.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={doConfirm} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: GRADIENT }}>Lock Game</button>
                  <button onClick={() => setMode(mode === 'counter' ? 'idle' : 'counter')} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-medium text-sky-800">
                    {mode === 'counter' ? 'Cancel counter' : 'Counter'}
                  </button>
                  <button onClick={doDecline} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600">Decline</button>
                </div>
              </>
            )}
            {pairRequest.status === 'proposed' && iAmRequester && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-amber-800">Pending — waiting on {oppTeam?.name} to respond to <b>{effectiveDate(pairRequest)}</b>. Date held.</div>
                <button onClick={doRelease} className="text-xs text-amber-700 underline">Release hold</button>
              </div>
            )}
            {pairRequest.status === 'countered' && iAmRequester && (
              <>
                <div className="text-sm text-slate-700">
                  {oppTeam?.name} countered with <b>{pairRequest.counter_date}</b> at {formatTime(pairRequest.counter_time)}.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={doConfirm} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: GRADIENT }}>Lock Game</button>
                  <button onClick={doDecline} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600">Decline</button>
                </div>
              </>
            )}
            {pairRequest.status === 'countered' && iAmReceiver && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-sky-800">Counter sent — waiting on {oppTeam?.name} to accept <b>{pairRequest.counter_date}</b>.</div>
                <button onClick={doRelease} className="text-xs text-sky-700 underline">Cancel</button>
              </div>
            )}
          </div>
        )}

        {mode === 'counter' && <div className="mb-3 rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-800">Pick an open date below to counter with.</div>}

        {/* calendar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={prevMonth} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
            <div className="flex items-center gap-2">
              <div className="text-base font-bold text-slate-900">{MO_FULL[month]} {year}</div>
              {!isCurrentMonth && <button onClick={goToday} className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ color: BLUE, borderColor: BLUE }}>Today</button>}
              {loading && <span className="text-[11px] text-slate-400">loading…</span>}
            </div>
            <button onClick={nextMonth} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WD.map((w) => <div key={w} className="py-1 text-center text-[11px] font-semibold text-slate-400">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d) => {
              const key = toKey(d);
              const inMonth = d.getMonth() === month && d.getFullYear() === year;
              const isToday = key === todayKey;
              let st = statuses.get(key);
              const isPairDate = pairDate === key && !!pairRequest;

              let cls = 'relative aspect-square rounded-md border text-[11px] sm:text-xs flex flex-col items-center justify-center ';
              let style: React.CSSProperties = {};
              let mark: string | null = null;

              if (!inMonth) cls += 'bg-slate-50 border-slate-100 text-slate-300';
              else if (isPairDate && pairRequest?.status === 'proposed') { cls += 'border-dashed bg-amber-50 border-amber-400 text-amber-700'; mark = '◷'; }
              else if (isPairDate && pairRequest?.status === 'countered') { cls += 'border-dashed bg-sky-50 border-sky-400 text-sky-700'; mark = '⇄'; }
              else if (!st || st.type === 'past') cls += 'bg-slate-50 border-slate-100 text-slate-300';
              else if (st.type === 'confirmed') { cls += 'text-white'; style = { backgroundColor: NAVY, borderColor: NAVY }; mark = '✓'; }
              else if (st.type === 'blackout') { cls += 'border-orange-300 text-orange-800'; style = { backgroundImage: 'repeating-linear-gradient(45deg,#fed7aa 0,#fed7aa 4px,#ffedd5 4px,#ffedd5 8px)' }; }
              else if (st.type === 'held') { cls += 'cursor-pointer bg-indigo-50 border-indigo-200 text-indigo-300'; mark = '⊘'; }
              else if (st.type === 'offday') cls += 'bg-slate-100 border-slate-200 text-slate-400';
              else cls += 'cursor-pointer bg-white border-slate-200 text-slate-700 hover:ring-2';

              if (isToday && inMonth) cls += ' ring-2 ring-offset-1';
              const clickable = inMonth && (st?.type === 'open' || st?.type === 'held');

              return (
                <button key={key} disabled={!clickable} onClick={() => onCell(key, inMonth)} className={cls}
                  style={{ ...style, ...(isToday && inMonth ? { boxShadow: `0 0 0 2px ${BLUE}` } : {}) }}>
                  <span className="font-mono leading-none">{d.getDate()}</span>
                  {inMonth && mark && <span className="absolute right-0.5 top-0.5 text-[9px]">{mark}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-slate-300 bg-white" /> Open</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-amber-400 border-dashed bg-amber-50" /> Pending hold</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-indigo-300 bg-indigo-50" /> Held elsewhere</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: NAVY }} /> Locked</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fed7aa 0,#fed7aa 3px,#ffedd5 3px,#ffedd5 6px)' }} /> Blackout</span>
          </div>
        </div>

        {/* propose panel */}
        {selectedDate && !pairRequest && (
          <div className="mt-4 rounded-xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: BLUE }}>
            <div className="font-bold text-slate-900">Propose game — {selectedDate}</div>
            <div className="mb-3 mt-1 text-xs text-slate-500">Sending places a 72-hour hold so this date can&apos;t be double-booked.</div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-slate-300">
                <button onClick={() => setProposeHome(true)} className="px-3 py-1.5 text-sm font-medium" style={proposeHome ? { backgroundColor: BLUE, color: '#fff' } : { backgroundColor: '#fff', color: '#475569' }}>Home</button>
                <button onClick={() => setProposeHome(false)} className="px-3 py-1.5 text-sm font-medium" style={!proposeHome ? { backgroundColor: BLUE, color: '#fff' } : { backgroundColor: '#fff', color: '#475569' }}>Away</button>
              </div>
              <select value={proposeTime} onChange={(e) => setProposeTime(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700">
                {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={doSend} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: GRADIENT }}>Send Handshake ›</button>
              <button onClick={() => setSelectedDate(null)} className="px-3 py-2 text-sm text-slate-500">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2.5 text-center text-sm text-white shadow-lg" style={{ backgroundColor: NAVY }}>{toast}</div>
      )}
    </main>
  );
}

// Auth helpers built on Supabase Auth (magic-link / OTP email).
import { supabase } from './supabaseClient';
import type { Team } from './types';
import type { User } from '@supabase/supabase-js';

// Ensure a `coaches` row exists for this auth user; return its id.
// Relies on the unique(user_id) constraint added in supabase/auth.sql.
export async function ensureCoachRecord(user: User): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : 'Coach');

  const { data: inserted, error: insErr } = await supabase
    .from('coaches')
    .insert({ user_id: user.id, full_name: fullName, email: user.email })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

export async function getCoachTeams(coachId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('team_coaches')
    .select('team:teams(*)')
    .eq('coach_id', coachId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.team).filter(Boolean);
}

export async function signInWithEmail(email: string): Promise<void> {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/schedule` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

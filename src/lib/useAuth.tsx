'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { ensureCoachRecord, getCoachTeams } from '@/lib/auth';
import type { Team } from '@/lib/types';

type AuthState = {
  user: User | null;
  coachId: string | null;
  myTeams: Team[];
  loading: boolean;
  refreshTeams: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  coachId: null,
  myTeams: [],
  loading: true,
  refreshTeams: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setCoachId(null);
      setMyTeams([]);
      setLoading(false);
      return;
    }
    try {
      const cid = await ensureCoachRecord(u);
      setCoachId(cid);
      setMyTeams(await getCoachTeams(cid));
    } catch (e) {
      // surface nothing fatal here; pages can show their own errors
      setCoachId(null);
      setMyTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => hydrate(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setLoading(true);
      hydrate(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const refreshTeams = useCallback(async () => {
    if (coachId) setMyTeams(await getCoachTeams(coachId));
  }, [coachId]);

  return (
    <AuthContext.Provider value={{ user, coachId, myTeams, loading, refreshTeams }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

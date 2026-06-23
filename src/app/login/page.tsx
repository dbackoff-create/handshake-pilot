'use client';

import { useState } from 'react';
import { signInWithEmail } from '@/lib/auth';

const NAVY = '#0B1F3A';
const GRADIENT = 'linear-gradient(90deg,#1897F2 0%,#35D7C9 100%)';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not send magic link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-1 text-2xl font-black uppercase tracking-tight" style={{ color: NAVY }}>
          Handshake
        </div>
        <p className="mb-6 text-sm text-slate-500">Sign in to schedule games.</p>

        {sent ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Check your email for a sign-in link. You can close this tab.
          </div>
        ) : (
          <>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="coach@email.com"
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: GRADIENT }}
            >
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

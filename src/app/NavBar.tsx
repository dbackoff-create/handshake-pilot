'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { signOut } from '@/lib/auth';

const NAVY = '#0B1F3A';

export default function NavBar() {
  const { user, myTeams } = useAuth();
  return (
    <nav className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ backgroundColor: NAVY }}>
      <div className="flex items-center gap-4">
        <Link href="/" className="font-black uppercase tracking-tight text-white">Handshake</Link>
        <Link href="/schedule" className="text-blue-100 hover:text-white">Schedule</Link>
        <Link href="/directory" className="text-blue-100 hover:text-white">Teams</Link>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="hidden text-blue-200 sm:inline">{myTeams[0]?.name ?? user.email}</span>
            <button onClick={() => signOut()} className="rounded-md bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">Sign out</button>
          </>
        ) : (
          <Link href="/login" className="rounded-md bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">Sign in</Link>
        )}
      </div>
    </nav>
  );
}

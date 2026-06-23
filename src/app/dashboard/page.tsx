const pendingRequests = [
  { opponent: "Palm Beach Select 12U", date: "2026-03-14", status: "Proposed" },
  { opponent: "Boca Bandits 12U", date: "2026-03-21", status: "Countered" },
];

const games = [
  { opponent: "Delray Elite 12U", date: "2026-03-08", field: "Burt Aaronson South" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="mt-2 text-slate-600">Your scheduling command center.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Metric label="Pending Requests" value={pendingRequests.length} />
          <Metric label="Upcoming Games" value={games.length} />
          <Metric label="Conflicts Prevented" value={3} />
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-bold">{value}</p>
    </div>
  );
}

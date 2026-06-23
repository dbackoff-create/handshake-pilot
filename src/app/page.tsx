export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-600">
            Handshake POC
          </p>
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
            Find dates. Lock games. Keep everyone in sync.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            A working proof-of-concept for travel baseball coaches to propose,
            counter, confirm, and lock games without endless texts.
          </p>
          <div className="mt-8 flex gap-3">
            <a className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white" href="/dashboard">
              View Dashboard
            </a>
            <a className="rounded-xl border border-slate-300 px-5 py-3 font-semibold" href="/directory">
              Find Teams
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

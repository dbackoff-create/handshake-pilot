const teams = [
  { name: "Florida United", age: "12U", city: "Boynton Beach", field: "Burt Aaronson South" },
  { name: "Palm Beach Select", age: "12U", city: "West Palm Beach", field: "Okeeheelee Park" },
  { name: "Boca Bandits", age: "12U", city: "Boca Raton", field: "Patch Reef Park" },
  { name: "Delray Elite", age: "12U", city: "Delray Beach", field: "Miller Park" },
];

export default function DirectoryPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">Team Directory</h1>
        <p className="mt-2 text-slate-600">Find verified opponents and send a Handshake.</p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {teams.map((team) => (
            <div key={team.name} className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-blue-600">{team.age}</p>
              <h2 className="mt-1 text-2xl font-bold">{team.name}</h2>
              <p className="mt-2 text-slate-600">{team.city} · {team.field}</p>
              <button className="mt-5 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
                Send Handshake
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

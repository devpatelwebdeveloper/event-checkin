"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import TopBar from "@/components/TopBar";
import { Registrant, Stats } from "@/lib/types";

export default function AdminPage() {
  const { user, loading } = useSession(["admin"]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Registrant[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/registrants?q=${encodeURIComponent(q)}&limit=50`);
      const data = await res.json();
      if (res.ok) setResults(data.registrants);
    } finally {
      setSearching(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (res.ok) setStats(data);
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runSearch("");
    fetchStats();
  }, [user, runSearch, fetchStats]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  async function handleUndo(id: number) {
    const res = await fetch(`/api/registrants/${id}/undo`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Undo failed");
      return;
    }
    setResults((prev) => prev.map((r) => (r.id === id ? data.registrant : r)));
    fetchStats();
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/registrants/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    setResults((prev) => prev.filter((r) => r.id !== id));
    fetchStats();
  }

  function handleExport() {
    window.location.href = "/api/registrants/export";
  }

  if (loading || !user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar user={user} title="Admin" />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <Link
            href="/admin/import"
            className="rounded-lg bg-blue-600 text-white font-medium px-4 py-2.5 text-sm hover:bg-blue-700"
          >
            Import registrants
          </Link>
          <Link
            href="/admin/users"
            className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 text-sm hover:bg-slate-100"
          >
            Manage volunteer accounts
          </Link>
          <Link
            href="/viewer"
            className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 text-sm hover:bg-slate-100"
          >
            View dashboard
          </Link>
          <Link
            href="/registrar"
            className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 text-sm hover:bg-slate-100"
          >
            Go to check-in
          </Link>
          <button
            onClick={handleExport}
            className="rounded-lg border border-slate-300 text-slate-700 font-medium px-4 py-2.5 text-sm hover:bg-slate-100"
          >
            Export results (CSV)
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <MiniStat label="Total" value={stats.total_registrants} />
            <MiniStat label="Checked In" value={stats.checked_in_registrations} />
            <MiniStat label="Pending" value={stats.pending_registrations} />
            <MiniStat label="People In" value={stats.checked_in_people} />
          </div>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search registrants…"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {searching && <p className="text-sm text-slate-400 mb-3">Searching…</p>}

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email / Phone</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {r.full_name}
                    {r.is_walkin && (
                      <span className="ml-2 text-xs font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Walk-in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{r.email}</div>
                    <div className="text-xs text-slate-400">{r.contact_number}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.total_family_count}</td>
                  <td className="px-4 py-3">
                    {r.checked_in ? (
                      <span className="text-green-700">
                        ✓ {r.checked_in_count} in
                        {r.checked_in_by_name && (
                          <span className="text-slate-400"> · {r.checked_in_by_name}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {r.checked_in && (
                        <button
                          onClick={() => handleUndo(r.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Undo
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(r.id, r.full_name)}
                        className="text-slate-400 hover:text-red-600 font-medium"
                        title="Delete registrant"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!searching && results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No registrants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

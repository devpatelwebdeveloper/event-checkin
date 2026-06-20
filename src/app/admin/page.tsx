"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  const [sort, setSort] = useState<{ field: "name" | "status"; dir: "asc" | "desc" }>({
    field: "status",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      let cmp = 0;
      if (sort.field === "name") {
        cmp = a.full_name.localeCompare(b.full_name);
      } else {
        // status: pending (false) before checked-in (true) when asc
        cmp = Number(a.checked_in) - Number(b.checked_in);
        if (cmp === 0) cmp = a.full_name.localeCompare(b.full_name);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [results, sort]);

  function toggleSort(field: "name" | "status") {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
    setPage(1);
  }

  const totalPages = Math.ceil(sortedResults.length / PAGE_SIZE);
  const pageResults = sortedResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setPage(1);
    try {
      const res = await fetch(`/api/registrants?q=${encodeURIComponent(q)}&limit=5000`);
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
    const data = await res.json().catch(() => ({}));
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
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-slate-800">
                    Name <SortIcon active={sort.field === "name"} dir={sort.dir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Email / Phone</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-slate-800">
                    Status <SortIcon active={sort.field === "status"} dir={sort.dir} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageResults.map((r) => (
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedResults.length)} of {sortedResults.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="px-3 py-1.5 font-medium">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={active ? "text-slate-700" : "text-slate-300"}>
      {!active ? "↕" : dir === "asc" ? "↑" : "↓"}
    </span>
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

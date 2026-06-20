"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/useSession";
import TopBar from "@/components/TopBar";
import { Stats } from "@/lib/types";

export default function ViewerPage() {
  const { user, loading } = useSession(["admin", "registrar", "viewer"]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load stats");
        return;
      }
      setStats(data);
      setLastUpdated(new Date());
      setError("");
    } catch {
      setError("Network error while loading stats");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    const interval = setInterval(fetchStats, 60_000); // auto-refresh every 60s
    return () => clearInterval(interval);
  }, [user, fetchStats]);

  if (loading || !user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  const percentCheckedIn =
    stats && stats.total_registrants > 0
      ? Math.round((stats.checked_in_registrations / stats.total_registrants) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar user={user} title="Check-In Dashboard" />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-500">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Loading…"}
          </p>
          <button
            onClick={fetchStats}
            disabled={refreshing}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh now"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">
            {error}
          </p>
        )}

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Checked In"
              value={stats.checked_in_registrations}
              sub={`${stats.checked_in_people} people`}
              color="green"
            />
            <StatCard
              label="Pending"
              value={stats.pending_registrations}
              sub="registrations not yet arrived"
              color="amber"
            />
            <StatCard
              label="Total Registrations"
              value={stats.total_registrants}
              sub={`${stats.total_expected_people} people expected`}
              color="slate"
            />
            <StatCard
              label="Progress"
              value={`${percentCheckedIn}%`}
              sub="of registrations checked in"
              color="blue"
            />
          </div>
        )}

        {stats && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${percentCheckedIn}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-8">
          This page refreshes automatically every minute.
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: "green" | "amber" | "slate" | "blue";
}) {
  const colorMap = {
    green: "text-green-700 bg-green-50 border-green-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl sm:text-4xl font-bold mt-1">{value}</p>
      <p className="text-xs opacity-70 mt-1">{sub}</p>
    </div>
  );
}

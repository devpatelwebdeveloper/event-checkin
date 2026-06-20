"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/lib/useSession";
import TopBar from "@/components/TopBar";
import RegistrantCard from "@/components/RegistrantCard";
import { Registrant } from "@/lib/types";

export default function RegistrarPage() {
  const { user, loading } = useSession(["admin", "registrar"]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Registrant[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/registrants?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }
      setResults(data.registrants);
    } catch {
      setError("Network error while searching");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  async function handleCheckIn(id: number, partyCount: number) {
    const res = await fetch(`/api/registrants/${id}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ party_count: partyCount }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Check-in failed");
      return;
    }
    setResults((prev) => prev.map((r) => (r.id === id ? data.registrant : r)));
  }

  async function handleUndo(id: number) {
    const res = await fetch(`/api/registrants/${id}/undo`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Undo failed");
      return;
    }
    setResults((prev) => prev.map((r) => (r.id === id ? data.registrant : r)));
  }

  if (loading || !user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar user={user} title="Check-In" />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6">
        <div className="mb-4">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or phone…"
            className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {searching && (
          <p className="text-sm text-slate-400 mb-3">Searching…</p>
        )}

        <div className="space-y-3">
          {results.map((r) => (
            <RegistrantCard
              key={r.id}
              registrant={r}
              currentUserId={user.id}
              isAdmin={user.role === "admin"}
              onCheckIn={handleCheckIn}
              onUndo={handleUndo}
            />
          ))}
          {!searching && query.trim().length > 0 && results.length === 0 && (
            <p className="text-center text-slate-500 py-8">
              No match found. Add as a walk-in below.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          {showAddWalkIn ? (
            <WalkInForm
              onAdded={() => {
                setShowAddWalkIn(false);
                runSearch(query);
              }}
              onCancel={() => setShowAddWalkIn(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddWalkIn(true)}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium py-4 hover:border-slate-400 hover:bg-slate-100 transition-colors"
            >
              + Add walk-in registrant
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function WalkInForm({
  onAdded,
  onCancel,
}: {
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [familyCount, setFamilyCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/registrants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          contact_number: phone,
          total_family_count: familyCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add registrant");
        return;
      }
      onAdded();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      <p className="font-medium text-slate-900">New walk-in registrant</p>
      <input
        required
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
      />
      <input
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
      />
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-700">Party size:</label>
        <input
          type="number"
          min={1}
          value={familyCount}
          onChange={(e) => setFamilyCount(parseInt(e.target.value, 10) || 1)}
          className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-base text-center"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-blue-600 text-white font-medium py-3 hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add registrant"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 text-slate-600 font-medium px-4 py-3"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

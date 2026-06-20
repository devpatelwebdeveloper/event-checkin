"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import TopBar from "@/components/TopBar";
import { UserRow } from "@/lib/types";

export default function UsersPage() {
  const { user, loading } = useSession(["admin"]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "registrar" | "viewer">("registrar");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    if (res.ok) setUsers(data.users);
  }, []);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchUsers();
    }
  }, [user, fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create account");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("registrar");
      fetchUsers();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this volunteer account?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to delete");
      return;
    }
    fetchUsers();
  }

  if (loading || !user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar user={user} title="Volunteer Accounts" />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Back to admin
        </Link>

        <form
          onSubmit={handleCreate}
          className="mt-4 bg-white rounded-xl border border-slate-200 p-5 space-y-3"
        >
          <p className="font-medium text-slate-900">Add a volunteer account</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
            <input
              required
              type="password"
              placeholder="Temporary password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-base bg-white"
            >
              <option value="registrar">Registrar (check-in)</option>
              <option value="viewer">Viewer (dashboard only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 text-white font-medium px-5 py-3 hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{u.role}</td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== user.id && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

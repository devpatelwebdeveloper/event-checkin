"use client";

import { useState } from "react";
import { Registrant, FamilyMember, CheckinMember } from "@/lib/types";

interface MemberInput {
  id: number | null;  // null = new member being added
  name: string;
  phone: string;
  present: boolean;
  isPrimary: boolean;
}

export default function RegistrantCard({
  registrant,
  currentUserId,
  isAdmin,
  onCheckIn,
  onUndo,
}: {
  registrant: Registrant;
  currentUserId: number;
  isAdmin: boolean;
  onCheckIn: (id: number, members: CheckinMember[]) => Promise<void>;
  onUndo: (id: number) => Promise<void>;
}) {
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [members, setMembers] = useState<MemberInput[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busy, setBusy] = useState(false);

  const canUndo = isAdmin || registrant.checked_in_by === currentUserId;
  const presentCount = members?.filter((m) => m.present).length ?? 0;

  async function handleCheckInClick() {
    setShowCheckinForm(true);
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/registrants/${registrant.id}/family`);
      const data = await res.json();
      setMembers(
        (data.members as FamilyMember[]).map((m) => ({
          id: m.id,
          name: m.name,
          phone: m.phone ?? (m.is_primary ? registrant.contact_number ?? "" : ""),
          present: true,
          isPrimary: m.is_primary,
        }))
      );
    } catch {
      setShowCheckinForm(false);
    } finally {
      setLoadingMembers(false);
    }
  }

  function togglePresent(i: number) {
    setMembers((prev) =>
      prev!.map((m, idx) => (idx === i ? { ...m, present: !m.present } : m))
    );
  }

  function updatePhone(i: number, phone: string) {
    setMembers((prev) =>
      prev!.map((m, idx) => (idx === i ? { ...m, phone } : m))
    );
  }

  function updateName(i: number, name: string) {
    setMembers((prev) =>
      prev!.map((m, idx) => (idx === i ? { ...m, name } : m))
    );
  }

  function addMember() {
    setMembers((prev) => [
      ...prev!,
      { id: null, name: "", phone: "", present: true, isPrimary: false },
    ]);
  }

  function removeMember(i: number) {
    setMembers((prev) => prev!.filter((_, idx) => idx !== i));
  }

  async function handleConfirmCheckIn() {
    if (!members || presentCount === 0) return;
    setBusy(true);
    try {
      await onCheckIn(
        registrant.id,
        members.map((m) => ({
          id: m.id,
          present: m.present,
          phone: m.phone.trim() || null,
        }))
      );
      setShowCheckinForm(false);
      setMembers(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    setBusy(true);
    try {
      await onUndo(registrant.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        registrant.checked_in
          ? "border-green-200 bg-green-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-base sm:text-lg truncate">
            {registrant.full_name}
            {registrant.is_walkin && (
              <span className="ml-2 text-xs font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                Walk-in
              </span>
            )}
          </p>
          {registrant.email && (
            <p className="text-sm text-slate-500 truncate">{registrant.email}</p>
          )}
          {registrant.contact_number && (
            <p className="text-sm text-slate-500">{registrant.contact_number}</p>
          )}
          <p className="text-sm text-slate-600 mt-1">
            Party size: <span className="font-medium">{registrant.total_family_count}</span>
            {registrant.family_member_names && (
              <span className="text-slate-500"> — {registrant.family_member_names}</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {registrant.checked_in ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-green-800">
              ✓ Checked in ({registrant.checked_in_count} arrived)
              {registrant.checked_in_by_name && (
                <span className="text-green-700"> by {registrant.checked_in_by_name}</span>
              )}
            </p>
            {canUndo && (
              <button
                onClick={handleUndo}
                disabled={busy}
                className="text-sm font-medium text-red-600 hover:text-red-800 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Undo
              </button>
            )}
          </div>
        ) : showCheckinForm ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Who&apos;s here?</p>
            {loadingMembers ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <>
                {members?.map((m, i) => (
                  <div
                    key={m.id ?? `new-${i}`}
                    className={`rounded-lg border p-3 transition-colors ${
                      m.present
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={m.present}
                        onChange={() => togglePresent(i)}
                        className="w-5 h-5 rounded accent-blue-600"
                      />
                      {m.id === null ? (
                        <input
                          type="text"
                          placeholder="Full name"
                          value={m.name}
                          onChange={(e) => updateName(i, e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 font-medium text-slate-900">
                          {m.name}
                          {m.isPrimary && (
                            <span className="ml-2 text-xs font-normal text-slate-400">(Primary)</span>
                          )}
                        </span>
                      )}
                      {m.id === null && (
                        <button
                          type="button"
                          onClick={() => removeMember(i)}
                          className="text-slate-400 hover:text-red-500 px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {m.present && (
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder={m.isPrimary ? "Phone number" : "Phone (optional)"}
                        value={m.phone}
                        onChange={(e) =>
                          updatePhone(i, e.target.value.replace(/[^0-9]/g, ""))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMember}
                  className="w-full rounded-lg border-2 border-dashed border-slate-300 text-slate-500 text-sm py-2 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  + Add family member
                </button>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmCheckIn}
                disabled={busy || presentCount === 0}
                className="flex-1 rounded-lg bg-green-600 text-white font-medium py-3 text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {busy ? "Saving…" : `Check In (${presentCount} present)`}
              </button>
              <button
                onClick={() => {
                  setShowCheckinForm(false);
                  setMembers(null);
                }}
                disabled={busy}
                className="rounded-lg border border-slate-300 text-slate-600 font-medium px-4 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleCheckInClick}
            className="w-full sm:w-auto rounded-lg bg-blue-600 text-white font-medium px-5 py-3 text-base hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Check In
          </button>
        )}
      </div>
    </div>
  );
}

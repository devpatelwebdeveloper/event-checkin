"use client";

import { useState } from "react";
import { Registrant } from "@/lib/types";

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
  onCheckIn: (id: number, partyCount: number) => Promise<void>;
  onUndo: (id: number) => Promise<void>;
}) {
  const [showPartyPrompt, setShowPartyPrompt] = useState(false);
  const [partyCount, setPartyCount] = useState(registrant.total_family_count);
  const [busy, setBusy] = useState(false);

  const canUndo = isAdmin || registrant.checked_in_by === currentUserId;

  async function handleConfirmCheckIn() {
    setBusy(true);
    try {
      await onCheckIn(registrant.id, partyCount);
      setShowPartyPrompt(false);
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
        ) : showPartyPrompt ? (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-slate-700">
              How many of the party are here?
            </label>
            <input
              type="number"
              min={1}
              max={registrant.total_family_count + 5}
              value={partyCount}
              onChange={(e) => setPartyCount(parseInt(e.target.value, 10) || 1)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-base text-center"
            />
            <button
              onClick={handleConfirmCheckIn}
              disabled={busy}
              className="rounded-lg bg-green-600 text-white font-medium px-4 py-2 text-sm hover:bg-green-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Confirm"}
            </button>
            <button
              onClick={() => setShowPartyPrompt(false)}
              disabled={busy}
              className="text-sm text-slate-500 px-3 py-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPartyPrompt(true)}
            className="w-full sm:w-auto rounded-lg bg-blue-600 text-white font-medium px-5 py-3 text-base hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Check In
          </button>
        )}
      </div>
    </div>
  );
}

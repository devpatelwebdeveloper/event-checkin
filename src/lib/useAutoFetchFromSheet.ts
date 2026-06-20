"use client";

import { useEffect, useRef, useState } from "react";

const AUTO_FETCH_INTERVAL_MS = 60_000; // matches the dashboard's 60s refresh cadence

interface AutoFetchStatus {
  enabled: boolean; // true once we've confirmed a sheet URL is configured
  lastFetchedAt: Date | null;
  lastResult: { inserted: number; updated: number } | null;
  lastError: string | null;
}

/**
 * Silently polls /api/registrants/fetch-from-sheet on an interval, as long as
 * an admin has configured a Google Sheet CSV URL. Does nothing (no errors shown)
 * if no URL is configured yet.
 *
 * IMPORTANT: only call this with active=true from a single admin session (e.g. the
 * admin dashboard), not from every registrar/viewer page. Registrars and viewers get
 * fresh data automatically because they read from Postgres (via search/stats), which
 * this hook keeps up to date - they don't each need to hit Google Sheets independently.
 * Running this from every iPad would mean 5-6 simultaneous Google Sheets fetches per
 * minute for no benefit.
 */
export function useAutoFetchFromSheet(active: boolean): AutoFetchStatus {
  const [status, setStatus] = useState<AutoFetchStatus>({
    enabled: false,
    lastFetchedAt: null,
    lastResult: null,
    lastError: null,
  });
  const checkedConfigRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function checkConfiguredThenStart() {
      try {
        const res = await fetch("/api/settings/sheet-url");
        const data = await res.json();
        if (cancelled) return;
        const configured = Boolean(data.sheetCsvUrl);
        setStatus((s) => ({ ...s, enabled: configured }));
        checkedConfigRef.current = true;
        if (configured) {
          // Run once immediately, then on an interval.
          runFetch();
          intervalId = setInterval(runFetch, AUTO_FETCH_INTERVAL_MS);
        }
      } catch {
        // Silently do nothing - this is a background convenience, not critical path.
      }
    }

    async function runFetch() {
      try {
        const res = await fetch("/api/registrants/fetch-from-sheet", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus((s) => ({ ...s, lastError: data.error || "Auto-fetch failed" }));
          return;
        }
        setStatus((s) => ({
          ...s,
          lastFetchedAt: new Date(),
          lastResult: { inserted: data.inserted, updated: data.updated ?? 0 },
          lastError: null,
        }));
      } catch {
        if (!cancelled) {
          setStatus((s) => ({ ...s, lastError: "Network error during auto-fetch" }));
        }
      }
    }

    checkConfiguredThenStart();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [active]);

  return status;
}

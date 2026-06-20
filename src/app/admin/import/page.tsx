"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { useAutoFetchFromSheet } from "@/lib/useAutoFetchFromSheet";
import TopBar from "@/components/TopBar";

interface ImportSummary {
  inserted: number;
  updated?: number;
  skipped: number;
  skippedReasons: string[];
  totalRows: number;
}

export default function ImportPage() {
  const { user, loading } = useSession(["admin"]);
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Sheets fetch-latest state
  const [sheetCsvUrl, setSheetCsvUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<ImportSummary | null>(null);
  const [fetchError, setFetchError] = useState("");

  // Auto-fetch runs in the background as long as this admin tab stays open and a
  // sheet URL is configured. This is a best-effort fallback - see the "Automatic
  // fetching" panel below for the more reliable always-on setup via external cron.
  const autoFetch = useAutoFetchFromSheet(Boolean(user));

  // Push-to-sheet state
  const [exportSheetId, setExportSheetId] = useState("");
  const [savingExportId, setSavingExportId] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ rowsWritten: number } | null>(null);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!user) return;
    fetch("/api/settings/sheet-url")
      .then((res) => res.json())
      .then((data) => {
        if (data.sheetCsvUrl) setSheetCsvUrl(data.sheetCsvUrl);
        if (data.exportSheetId) setExportSheetId(data.exportSheetId);
      })
      .catch(() => {});
  }, [user]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(reader.result as string);
    reader.readAsText(file);
  }

  async function handleImport() {
    setError("");
    setResult(null);
    if (!csv.trim()) {
      setError("Paste CSV content or upload a file first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/registrants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error during import");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveSheetUrl() {
    setSavingUrl(true);
    try {
      await fetch("/api/settings/sheet-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetCsvUrl }),
      });
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleFetchLatest() {
    setFetchError("");
    setFetchResult(null);
    setFetching(true);
    try {
      const res = await fetch("/api/registrants/fetch-from-sheet", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || "Fetch failed");
        return;
      }
      setFetchResult(data);
    } catch {
      setFetchError("Network error while fetching from sheet");
    } finally {
      setFetching(false);
    }
  }

  async function handleSaveExportId() {
    setSavingExportId(true);
    try {
      await fetch("/api/settings/sheet-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportSheetId }),
      });
    } finally {
      setSavingExportId(false);
    }
  }

  async function handlePushToSheet() {
    setPushError("");
    setPushResult(null);
    setPushing(true);
    try {
      const res = await fetch("/api/registrants/push-to-sheet", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPushError(data.error || "Push failed");
        return;
      }
      setPushResult(data);
    } catch {
      setPushError("Network error while pushing to sheet");
    } finally {
      setPushing(false);
    }
  }

  if (loading || !user) {
    return <div className="p-6 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar user={user} title="Import Registrants" />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Back to admin
        </Link>

        {/* Option A: Fetch latest from Google Sheet (recommended, no token needed) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-medium text-slate-900 mb-1">
            Fetch latest from Google Sheet (recommended)
          </p>
          <p className="text-sm text-slate-600 mb-3">
            One-time setup: in your Sheet, click <strong>Share</strong> → set to
            &ldquo;Anyone with the link can view&rdquo;. Then use{" "}
            <strong>File → Share → Publish to web</strong> → choose CSV format, or just
            use this export link pattern:{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv
            </code>
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={sheetCsvUrl}
              onChange={(e) => setSheetCsvUrl(e.target.value)}
              placeholder="Paste your Sheet's CSV export URL"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleSaveSheetUrl}
              disabled={savingUrl || !sheetCsvUrl.trim()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {savingUrl ? "Saving…" : "Save URL"}
            </button>
          </div>

          {/* Auto-fetch status - this is the "automatic" behavior happening right now in this tab */}
          {sheetCsvUrl.trim() && (
            <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
              {autoFetch.enabled ? (
                <>
                  <p className="font-medium">
                    ⟳ Auto-fetching every minute while this page is open
                  </p>
                  {autoFetch.lastFetchedAt && (
                    <p className="text-xs text-blue-700 mt-0.5">
                      Last checked {autoFetch.lastFetchedAt.toLocaleTimeString()}
                      {autoFetch.lastResult &&
                        ` — ${autoFetch.lastResult.inserted} new, ${autoFetch.lastResult.updated} updated`}
                    </p>
                  )}
                  {autoFetch.lastError && (
                    <p className="text-xs text-red-700 mt-0.5">{autoFetch.lastError}</p>
                  )}
                </>
              ) : (
                <p>Checking auto-fetch status…</p>
              )}
            </div>
          )}

          <button
            onClick={handleFetchLatest}
            disabled={fetching || !sheetCsvUrl.trim()}
            className="w-full rounded-lg bg-green-600 text-white font-medium py-3 hover:bg-green-700 disabled:opacity-60"
          >
            {fetching ? "Fetching…" : "↻ Fetch latest registrations now"}
          </button>

          {fetchError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {fetchError}
            </p>
          )}
          {fetchResult && (
            <p className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {fetchResult.inserted} new, {fetchResult.updated ?? 0} updated,{" "}
              {fetchResult.skipped} skipped (of {fetchResult.totalRows} rows). Re-running
              this never duplicates existing registrants or undoes check-ins.
            </p>
          )}

          <details className="mt-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Want this to keep running even if no one has this page open?
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                The auto-fetch above only runs while this admin page is open in a browser
                tab. For truly hands-off updating (e.g. overnight, or if no admin is
                watching this screen), point a free external scheduler at this app&apos;s
                fetch endpoint:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Set a <code className="text-xs bg-slate-100 px-1 rounded">CRON_SECRET</code>{" "}
                  environment variable in Vercel (any long random string).
                </li>
                <li>
                  Create a free account at{" "}
                  <a
                    href="https://cron-job.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    cron-job.org
                  </a>{" "}
                  (or similar) and add a job that sends a{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">POST</code> to:
                  <br />
                  <code className="text-xs bg-slate-100 px-1 rounded break-all">
                    https://your-app.vercel.app/api/registrants/fetch-from-sheet
                  </code>
                </li>
                <li>
                  Add a header:{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">
                    Authorization: Bearer YOUR_CRON_SECRET
                  </code>
                </li>
                <li>Set the schedule to run every 1-5 minutes.</li>
              </ol>
              <p className="text-xs text-slate-500">
                (Vercel&apos;s own built-in Cron Jobs only run once per day on the free
                Hobby plan, which is too infrequent for this — an external scheduler is
                the practical free option for minute-level updates.)
              </p>
            </div>
          </details>
        </div>

        {/* Option B: Manual paste/upload (fallback, also upsert-safe) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-medium text-slate-900 mb-1">Or paste/upload CSV manually</p>
          <p className="text-sm text-slate-600 mb-4">
            In Google Sheets: <strong>File → Download → Comma Separated Values (.csv)</strong>,
            then upload or paste below. Safe to re-run — re-uploading the same or an updated
            sheet updates existing registrants and adds new ones without creating duplicates
            or affecting anyone already checked in.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600 mb-3"
          />

          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="Or paste raw CSV text here…"
            rows={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono mb-3"
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {result && (
            <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-green-800">
              <p>
                {result.inserted} new, {result.updated ?? 0} updated
                {result.skipped > 0 && `, ${result.skipped} skipped`} (of{" "}
                {result.totalRows} rows).
              </p>
              {result.skippedReasons.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs text-green-700">
                  {result.skippedReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 text-white font-medium py-3 hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Importing…" : "Import registrants"}
          </button>
        </div>

        {/* Push results back to a sheet (nice-to-have, requires service account setup) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-medium text-slate-900 mb-1">
            Push check-in results to Google Sheets
          </p>
          <p className="text-sm text-slate-600 mb-3">
            Writes full results to a &ldquo;Check-In Results&rdquo; tab in a sheet of your
            choice, overwriting that tab each time you click (safe to repeat). Requires a
            one-time Google Service Account setup by whoever deploys this app — see{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              src/lib/google-sheets.ts
            </code>{" "}
            for setup steps if this isn&apos;t configured yet. Share the target sheet with
            the service account&apos;s email as an Editor.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={exportSheetId}
              onChange={(e) => setExportSheetId(e.target.value)}
              placeholder="Paste the target Sheet's URL or ID"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleSaveExportId}
              disabled={savingExportId || !exportSheetId.trim()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {savingExportId ? "Saving…" : "Save"}
            </button>
          </div>
          <button
            onClick={handlePushToSheet}
            disabled={pushing || !exportSheetId.trim()}
            className="w-full rounded-lg border-2 border-slate-300 text-slate-700 font-medium py-3 hover:bg-slate-100 disabled:opacity-60"
          >
            {pushing ? "Pushing…" : "Push results to Google Sheet"}
          </button>
          {pushError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {pushError}
            </p>
          )}
          {pushResult && (
            <p className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Wrote {pushResult.rowsWritten} rows to the sheet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

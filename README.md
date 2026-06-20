# Event Check-In App

A multi-volunteer event check-in app. Works on iPad, phone, and desktop browsers.
Three roles: **Admin**, **Registrar** (does check-ins), **Viewer** (read-only live counts).

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Postgres (via Vercel/Neon Storage integration)
- Custom JWT auth in an httpOnly cookie (no third-party auth provider needed)

## Design decisions & project context (read before changing core logic)

This section exists so future work (by a human or an AI coding assistant) doesn't
accidentally re-litigate or revert decisions that were made deliberately. If you're
about to "fix" something on this list, it's probably intentional — check here first.

- **CSV column mapping: use "Email", ignore "Email Address".** The source Google Sheet
  has two similarly-named columns. "Email Address" is unused/empty in the real data;
  "Email" is the actual field. This mapping lives in `src/lib/import-csv.ts` via
  `findCol(row, "Email")` — do not swap this or add "Email Address" as a fallback
  without re-confirming with the sheet owner, since the columns look like duplicates
  but aren't.

- **Family/party check-in is "how many arrived," not all-or-nothing.** A registration
  has a `total_family_count` (how many people registered together), but check-in
  asks "how many of your party are here right now?" and stores that separately as
  `checked_in_count`. This is deliberate — families often arrive partially. Don't
  collapse this back into a simple boolean.

- **Re-importing/re-fetching from the sheet is an upsert, never a blind insert.**
  Matching is by email (case-insensitive) when present, falling back to
  name+phone when there's no email. This must NEVER duplicate a registrant on
  re-import, and must NEVER overwrite `checked_in` / `checked_in_count` /
  `checked_in_by` / `checked_in_at` for someone already checked in — even if
  their other details (phone, address, family count) changed in the sheet.
  This logic is covered by `npm run test:smoke`'s upsert/dedup section; if you
  touch `src/lib/import-csv.ts`, re-run that test.

- **Three roles, no account limits.** Admin (full access), Registrar (search +
  check-in + undo own check-ins), Viewer (read-only dashboard, counts only - no
  search, no registrant details). There is intentionally no cap on how many
  registrar/viewer accounts can be created. Accounts are individual (not shared
  per-role passwords), specifically so check-ins show which volunteer did them.

- **Registrars can only undo their own check-ins; admins can undo anyone's.**
  This is enforced server-side in `src/app/api/registrants/[id]/undo/route.ts`,
  not just hidden in the UI - don't rely on hiding the undo button as the only
  protection.

- **Auto-fetch from Google Sheets: automatic. Push-to-sheet: manual only, by
  explicit request.** The fetch direction (pulling new registrants in) runs
  automatically - every 60s while an admin's Import tab is open, and optionally
  via an external cron + `CRON_SECRET` for fully hands-off operation. The push
  direction (writing results back to a sheet) was deliberately kept manual-only
  - it should never run on a timer, since an automatic overwrite of the results
  sheet mid-event (while volunteers are actively checking people in) would be
  disruptive and is more useful as a deliberate, admin-triggered action (e.g. at
  the end of the night). Do not add a timer/interval to the push-to-sheet
  endpoint or button without this being an explicit, separate decision.

- **No Google OAuth/token needed for fetching; a Service Account is needed for
  pushing.** Fetching just reads a public CSV export URL (sheet shared as
  "Anyone with the link can view") - zero credentials. Pushing requires write
  access, which needs a Google Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` +
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` env vars) shared as an Editor on the
  target sheet. These are two different sheets conceptually (source sheet you
  read from vs. results sheet you write to) even though they could be the same
  physical sheet if the user wants.

- **Why Postgres instead of using Google Sheets as the live datastore.** This was
  explicitly discussed and rejected for the live check-in path: Google Sheets API
  has write-concurrency/rate-limit risk with 5-6 simultaneous iPads, and higher
  latency than Postgres. Sheets is used only as an import source (read) and
  optional results destination (write), never as the system of record during
  the event.

## 1. Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **New Project** → import the repo.
3. In your Vercel project, go to **Storage** tab → **Create Database** → choose **Postgres** (Neon).
   Connect it to your project — this automatically adds `POSTGRES_URL` (and related vars) to your
   environment variables. You don't need to copy/paste a connection string yourself.
4. Go to **Settings → Environment Variables** and add:
   - `JWT_SECRET` — a long random string (generate with `openssl rand -base64 32`). Required in Production.
5. Deploy.

## 2. Set up the database schema

After the first deploy (so `POSTGRES_URL` exists), run the schema setup once.
Easiest way: use Vercel CLI to pull env vars locally, then run the script:

```bash
npm install -g vercel
vercel link        # link this folder to your Vercel project
vercel env pull .env.local
npm run db:setup    # creates the users/registrants/checkin_log tables
```

Alternatively, open the Neon/Postgres dashboard's SQL console (linked from the Storage tab)
and paste the contents of `src/lib/schema.sql` directly.

## 3. Create your first admin account

There's a chicken-and-egg problem: you need an admin account to create more accounts.
Run this once (locally, with env vars pulled as above):

```bash
npm run db:seed-admin -- "Your Name" "you@example.com" "yourpassword"
```

Now log in at `https://your-app.vercel.app/login` with that email/password — you'll land on `/admin`.

## 4. Set up volunteers and import registrants

From the Admin dashboard:
1. **Manage volunteer accounts** → create a login for each registrar and viewer (individual
   accounts, so check-ins show who did them). **No limit on the number of accounts** — create
   as many registrars as you need.
2. **Import registrants** — three ways to get data in, all upsert-safe (see below):
   - **Fetch latest from Google Sheet (recommended)**: share your sheet as "Anyone with the
     link can view", paste its CSV export URL
     (`https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv`) into the Import
     page, save it. From then on, **this happens automatically**:
     - While the Import page is open in any admin's browser tab, it re-fetches every
       60 seconds in the background — no clicking needed.
     - For fully hands-off updating (e.g. overnight, or with no admin watching a screen),
       set a `CRON_SECRET` env var and point a free external scheduler like
       [cron-job.org](https://cron-job.org) at
       `POST /api/registrants/fetch-from-sheet` with header
       `Authorization: Bearer YOUR_CRON_SECRET`, every 1-5 minutes. (Vercel's own
       built-in Cron Jobs only run once/day on the free Hobby plan, too infrequent here —
       see the in-app instructions on the Import page for the exact steps.)
     - The manual **"Fetch latest registrations now"** button is also still there any
       time you want to force an immediate refresh.
   - **Paste/upload CSV manually** — same upsert safety, useful as a fallback or one-off.
   - **Push results back to a Google Sheet** (optional, nice-to-have, manual only by
     design — it deliberately does NOT run automatically, so it never overwrites your
     results sheet while volunteers are mid-check-in) — needs a one-time Google Service
     Account setup (see `src/lib/google-sheets.ts` for steps and `.env.example` for the
     two env vars). Once configured, click **"Push results to Google Sheet"** any time
     to write a full results tab — safe to click repeatedly.

   **Re-import safety**: importing/fetching is an upsert, not a blind insert. Re-running it
   (with the same or an updated sheet) will add new registrants and update changed details
   for existing ones (matched by email, or by name+phone if no email) — it will **never**
   create duplicate rows, and it will **never** undo or change anyone's check-in status,
   even if their row in the sheet changes. This means you can keep the sheet open and
   re-fetch right up to the last moment, including after check-in has started.

   Note: a column literally named "Email Address" is ignored on purpose — "Email" is the
   field actually used, per your sheet.

## 5. Event day

- Registrars log in on any iPad/phone/laptop browser at your app's URL, land on `/registrar`,
  search by name/email/phone, tap **Check In**, enter how many of the party arrived.
- Viewers log in and land on `/viewer` — a live dashboard (checked-in vs pending) that
  auto-refreshes every 60 seconds, plus a manual refresh button.
- Admin can see the full table, undo any check-in, add late walk-ins, and export results.

## 6. After the event

From `/admin`, click **Export results (CSV)** to download final check-in data
(who attended, party size, who checked them in, timestamps) — keep this for your records
or re-upload to a Google Sheet.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in a local/dev POSTGRES_URL and a JWT_SECRET
npm run db:setup
npm run db:seed-admin -- "Admin Name" "admin@example.com" "password123"
npm run dev
```

## Notes on this scale (1,200-2,000 registrants, 5-6 iPads)

This setup comfortably handles that load — Postgres queries here are simple indexed
lookups, well under what a single small database instance handles. No additional
scaling work is needed for an event of this size. There's also no limit in the app
on the number of registrar/viewer accounts you create — add as many volunteers as
you need.

## Testing

Two test scripts validate core logic against an in-memory Postgres (no real DB needed):

```bash
npm run test:smoke      # exercises auth, search, check-in, undo, stats, constraints, and the
                         # re-import upsert/dedup logic (confirms re-importing never duplicates
                         # registrants or erases check-in status)
npm run test:csv        # validates CSV column-mapping against your actual sheet headers
npm run test:cron-auth  # validates the CRON_SECRET bearer-token auth used for automated fetch
```

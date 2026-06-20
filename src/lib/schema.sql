-- Run this once against your Postgres database to set up tables.
-- Locally: psql $DATABASE_URL -f src/lib/schema.sql
-- On Vercel: use the Neon/Vercel Postgres SQL console (Storage tab) and paste this in,
-- or run `npm run db:setup` (see package.json script) with POSTGRES_URL set.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'registrar', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrants (
  id SERIAL PRIMARY KEY,
  timestamp_raw TEXT,
  email TEXT,
  full_name TEXT NOT NULL,
  contact_number TEXT,
  address TEXT,
  total_family_count INTEGER DEFAULT 1,
  family_member_names TEXT,
  heard_about_event TEXT,
  referred_by TEXT,

  checked_in BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_count INTEGER,
  checked_in_by INTEGER REFERENCES users(id),
  checked_in_at TIMESTAMPTZ,

  is_walkin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speed up search by name/email/phone (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_registrants_full_name_lower ON registrants (LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_registrants_email_lower ON registrants (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_registrants_contact_number ON registrants (contact_number);
CREATE INDEX IF NOT EXISTS idx_registrants_checked_in ON registrants (checked_in);

-- Used to detect duplicate rows on re-import (same registrant uploaded twice).
-- Only enforced when email is present and non-empty - rows without an email
-- are deduped in application code instead (by name + phone), since a unique
-- index can't reliably express "same name AND same phone" as cleanly as we'd like
-- when phone may also be missing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrants_email_unique
  ON registrants (LOWER(email))
  WHERE email IS NOT NULL AND email <> '' AND is_walkin = FALSE;

-- Simple audit trail of check-in actions (so admin can see history / undo accurately)
CREATE TABLE IF NOT EXISTS checkin_log (
  id SERIAL PRIMARY KEY,
  registrant_id INTEGER NOT NULL REFERENCES registrants(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('checkin', 'undo')),
  party_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

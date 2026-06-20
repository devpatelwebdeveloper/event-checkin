import { query } from "@/lib/db";
import Papa from "papaparse";

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  skippedReasons: string[];
  totalRows: number;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length > 0 ? digits : null;
}

function findCol(row: Record<string, string>, ...candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find(
      (k) => k.toLowerCase().trim() === candidate.toLowerCase().trim()
    );
    if (match) return row[match];
  }
  return null;
}

/**
 * Parses CSV text matching the registrant sheet's columns and upserts rows into
 * the registrants table.
 *
 * SAFE TO RE-RUN: matches existing registrants by email (or by name+phone when
 * email is absent) and updates their details rather than duplicating them.
 * Never overwrites checked_in / checked_in_by / checked_in_at, so re-importing
 * never erases someone's check-in status.
 */
export async function importRegistrantsFromCsv(csv: string): Promise<ImportResult> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.filter((e) => e.type !== "FieldMismatch");
    if (fatal.length > 0) {
      throw new Error(
        "CSV parse error: " + fatal.map((e) => e.message).join("; ")
      );
    }
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    throw new Error("No data rows found in CSV");
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  for (const row of rows) {
    const fullName = findCol(row, "Full Name");
    if (!fullName || fullName.trim().length === 0) {
      skipped++;
      skippedReasons.push("Missing Full Name");
      continue;
    }

    const timestamp = findCol(row, "Timestamp");
    const email = findCol(row, "Email"); // NOT "Email Address" - that column is unused
    const contactNumber = findCol(row, "Contact Number");
    const address = findCol(row, "Address");
    const familyCountRaw = findCol(
      row,
      "Total Family Count (including yourself)",
      "Total Family Count"
    );
    const familyMembers = findCol(row, "Family Member Name(s)", "Family Member Names");
    const heardAbout = findCol(row, "How did you hear about this event?");
    const referredBy = findCol(row, "Referred by");

    const familyCount = parseInt(familyCountRaw || "1", 10);
    const normalizedEmail = email && email.trim().length > 0 ? email.trim() : null;
    const cleanName = fullName.trim();
    const cleanPhone = normalizePhone(contactNumber);

    let existing: { id: number }[] = [];
    if (normalizedEmail) {
      existing = await query<{ id: number }>(
        `SELECT id FROM registrants WHERE LOWER(email) = LOWER($1) AND is_walkin = FALSE`,
        [normalizedEmail]
      );
    } else {
      existing = await query<{ id: number }>(
        `SELECT id FROM registrants
         WHERE LOWER(full_name) = LOWER($1)
           AND COALESCE(contact_number, '') = COALESCE($2, '')
           AND is_walkin = FALSE`,
        [cleanName, cleanPhone]
      );
    }

    const values = [
      timestamp || null,
      normalizedEmail,
      cleanName,
      cleanPhone,
      address || null,
      isNaN(familyCount) || familyCount < 1 ? 1 : familyCount,
      familyMembers || null,
      heardAbout || null,
      referredBy || null,
    ];

    if (existing.length > 0) {
      await query(
        `UPDATE registrants
         SET timestamp_raw = $1, email = $2, full_name = $3, contact_number = $4,
             address = $5, total_family_count = $6, family_member_names = $7,
             heard_about_event = $8, referred_by = $9, updated_at = now()
         WHERE id = $10`,
        [...values, existing[0].id]
      );
      updated++;
    } else {
      await query(
        `INSERT INTO registrants
          (timestamp_raw, email, full_name, contact_number, address,
           total_family_count, family_member_names, heard_about_event, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values
      );
      inserted++;
    }
  }

  return {
    inserted,
    updated,
    skipped,
    skippedReasons: skippedReasons.slice(0, 10),
    totalRows: rows.length,
  };
}

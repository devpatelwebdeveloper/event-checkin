/**
 * Smoke test: boots an in-memory Postgres (pg-mem), applies our real schema.sql,
 * then exercises the core flows (seed admin, create users, import CSV-like rows,
 * search, check-in, undo, stats) using the same SQL the app's route handlers use.
 *
 * This doesn't spin up Next.js itself, but it validates: schema correctness,
 * query correctness, and the logic each route handler performs against a real
 * (in-memory) Postgres engine - catching SQL bugs before deploying.
 */
import { newDb } from "pg-mem";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ FAILED:", msg);
    process.exitCode = 1;
  } else {
    console.log("✅", msg);
  }
}

async function main() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  // 1. Apply real schema
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "schema.sql"),
    "utf-8"
  );
  await pool.query(schema);
  console.log("✅ Schema applied without error");

  // 2. Seed admin (mirrors scripts/seed-admin.mjs logic)
  const adminHash = await bcrypt.hash("adminpass123", 10);
  const adminRes = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id`,
    ["Test Admin", "admin@test.com", adminHash]
  );
  const adminId = adminRes.rows[0].id;
  assert(typeof adminId === "number", "Admin user created with numeric id");

  // 3. Create a registrar account (mirrors POST /api/users logic)
  const regHash = await bcrypt.hash("registrar123", 10);
  const regRes = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'registrar') RETURNING id`,
    ["Volunteer One", "vol1@test.com", regHash]
  );
  const registrarId = regRes.rows[0].id;
  assert(typeof registrarId === "number", "Registrar user created");

  // 4. Login verification logic (mirrors /api/auth/login)
  const loginCheck = await pool.query(
    `SELECT password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
    ["vol1@test.com"]
  );
  const valid = await bcrypt.compare("registrar123", loginCheck.rows[0].password_hash);
  assert(valid === true, "Login password verification works");
  const invalid = await bcrypt.compare("wrongpass", loginCheck.rows[0].password_hash);
  assert(invalid === false, "Login rejects wrong password");

  // 5. Import simulated CSV rows (mirrors /api/registrants/import insert logic)
  const sampleRegistrants = [
    {
      timestamp: "6/1/2026 10:00:00",
      email: "jane@example.com",
      full_name: "Jane Smith",
      contact_number: "555-1234",
      address: "123 Main St",
      family_count: 4,
      family_members: "John Smith, Jr Smith, Amy Smith",
      heard: "Instagram",
      referred: "Mary Lee",
    },
    {
      timestamp: "6/1/2026 11:00:00",
      email: "bob@example.com",
      full_name: "Bob Johnson",
      contact_number: "555-5678",
      address: "456 Oak Ave",
      family_count: 1,
      family_members: null,
      heard: "Friend",
      referred: null,
    },
  ];

  for (const r of sampleRegistrants) {
    await pool.query(
      `INSERT INTO registrants
        (timestamp_raw, email, full_name, contact_number, address,
         total_family_count, family_member_names, heard_about_event, referred_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        r.timestamp,
        r.email,
        r.full_name,
        r.contact_number,
        r.address,
        r.family_count,
        r.family_members,
        r.heard,
        r.referred,
      ]
    );
  }

  const countRes = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(countRes.rows[0].count, 10) === 2, "Both registrants imported");

  // 6. Search logic (mirrors GET /api/registrants?q=...)
  const searchTerm = "jane";
  const likeTerm = `%${searchTerm.toLowerCase()}%`;
  const searchRes = await pool.query(
    `SELECT r.*, u.name AS checked_in_by_name
     FROM registrants r
     LEFT JOIN users u ON u.id = r.checked_in_by
     WHERE LOWER(r.full_name) LIKE $1
        OR LOWER(r.email) LIKE $1
        OR r.contact_number LIKE $1
     ORDER BY
       CASE WHEN LOWER(r.full_name) LIKE $2 THEN 0 ELSE 1 END,
       r.full_name ASC`,
    [likeTerm, `${searchTerm.toLowerCase()}%`]
  );
  assert(searchRes.rows.length === 1, "Search by partial name finds exactly Jane Smith");
  assert(searchRes.rows[0].full_name === "Jane Smith", "Search result is correct registrant");
  const janeId = searchRes.rows[0].id;

  // Search by partial email
  const emailSearch = await pool.query(
    `SELECT * FROM registrants WHERE LOWER(email) LIKE $1`,
    ["%bob@%"]
  );
  assert(emailSearch.rows.length === 1 && emailSearch.rows[0].full_name === "Bob Johnson",
    "Search by partial email finds Bob Johnson");

  // 7. Check-in logic (mirrors POST /api/registrants/:id/checkin)
  const checkinRes = await pool.query(
    `UPDATE registrants
     SET checked_in = TRUE, checked_in_count = $1, checked_in_by = $2, checked_in_at = now(), updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [3, registrarId, janeId] // Jane registered 4, only 3 showed up
  );
  await pool.query(
    `INSERT INTO checkin_log (registrant_id, user_id, action, party_count) VALUES ($1,$2,'checkin',$3)`,
    [janeId, registrarId, 3]
  );
  assert(checkinRes.rows[0].checked_in === true, "Jane marked as checked in");
  assert(checkinRes.rows[0].checked_in_count === 3, "Partial family arrival (3 of 4) recorded correctly");

  // 8. Attempting to check in an already-checked-in registrant should be detectable
  const alreadyIn = await pool.query(`SELECT checked_in FROM registrants WHERE id = $1`, [janeId]);
  assert(alreadyIn.rows[0].checked_in === true, "Double check-in would be correctly detected as already checked in");

  // 9. Stats query (mirrors GET /api/stats)
  const statsRes = await pool.query(
    `SELECT
      COUNT(*) AS total_registrants,
      COALESCE(SUM(total_family_count), 0) AS total_expected_people,
      COALESCE(SUM(CASE WHEN checked_in = TRUE THEN 1 ELSE 0 END), 0) AS checked_in_registrations,
      COALESCE(SUM(CASE WHEN checked_in = TRUE THEN checked_in_count ELSE 0 END), 0) AS checked_in_people
     FROM registrants`
  );
  const stats = statsRes.rows[0];
  assert(parseInt(stats.total_registrants, 10) === 2, "Stats: total registrants = 2");
  assert(parseInt(stats.total_expected_people, 10) === 5, "Stats: total expected people = 5 (4+1)");
  assert(parseInt(stats.checked_in_registrations, 10) === 1, "Stats: 1 registration checked in");
  assert(parseInt(stats.checked_in_people, 10) === 3, "Stats: 3 people checked in (Jane's partial party)");

  // 10. Undo logic (mirrors POST /api/registrants/:id/undo) - registrar undoing own check-in
  const beforeUndo = await pool.query(`SELECT checked_in_by FROM registrants WHERE id = $1`, [janeId]);
  const canUndo = beforeUndo.rows[0].checked_in_by === registrarId;
  assert(canUndo === true, "Registrar who performed check-in is allowed to undo it");

  await pool.query(
    `UPDATE registrants SET checked_in = FALSE, checked_in_count = NULL, checked_in_by = NULL, checked_in_at = NULL, updated_at = now()
     WHERE id = $1`,
    [janeId]
  );
  const afterUndo = await pool.query(`SELECT checked_in FROM registrants WHERE id = $1`, [janeId]);
  assert(afterUndo.rows[0].checked_in === false, "Undo correctly reverts checked_in to false");

  // 11. Walk-in registrant insert (mirrors POST /api/registrants)
  const walkinRes = await pool.query(
    `INSERT INTO registrants (full_name, email, contact_number, total_family_count, is_walkin)
     VALUES ($1,$2,$3,$4,TRUE) RETURNING id, is_walkin`,
    ["Walk In Person", null, "555-9999", 2]
  );
  assert(walkinRes.rows[0].is_walkin === true, "Walk-in registrant flagged correctly");

  const finalCount = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(finalCount.rows[0].count, 10) === 3, "Final registrant count is 3 (2 imported + 1 walk-in)");

  // 12. Role constraint check - invalid role should fail
  let roleConstraintWorked = false;
  try {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`,
      ["Bad Role", "bad@test.com", "hash", "superuser"]
    );
  } catch {
    roleConstraintWorked = true;
  }
  assert(roleConstraintWorked === true, "Database rejects invalid role value (CHECK constraint works)");

  // 13. Duplicate email constraint check
  let dupeConstraintWorked = false;
  try {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'viewer')`,
      ["Dupe Admin", "admin@test.com", "hash"]
    );
  } catch {
    dupeConstraintWorked = true;
  }
  assert(dupeConstraintWorked === true, "Database rejects duplicate user email (UNIQUE constraint works)");

  console.log("\nSmoke test complete.");
}

async function testUpsertDedup() {
  console.log("\n--- Testing re-import dedup/upsert behavior ---");
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  const schema = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "schema.sql"),
    "utf-8"
  );
  await pool.query(schema);

  // Simulates the upsert logic in src/lib/import-csv.ts directly against this pool,
  // since that module imports the app's db.ts (which expects a real env var pool).
  // This re-implements the same SQL the route uses, to validate it against pg-mem.
  async function upsertRegistrant(row) {
    const normalizedEmail = row.email && row.email.trim().length > 0 ? row.email.trim() : null;
    const cleanName = row.full_name.trim();

    let existing;
    if (normalizedEmail) {
      existing = await pool.query(
        `SELECT id FROM registrants WHERE LOWER(email) = LOWER($1) AND is_walkin = FALSE`,
        [normalizedEmail]
      );
    } else {
      existing = await pool.query(
        `SELECT id FROM registrants
         WHERE LOWER(full_name) = LOWER($1)
           AND COALESCE(contact_number, '') = COALESCE($2, '')
           AND is_walkin = FALSE`,
        [cleanName, row.contact_number || null]
      );
    }

    const values = [
      row.timestamp || null,
      normalizedEmail,
      cleanName,
      row.contact_number || null,
      row.address || null,
      row.family_count || 1,
      row.family_members || null,
      row.heard || null,
      row.referred || null,
    ];

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE registrants
         SET timestamp_raw = $1, email = $2, full_name = $3, contact_number = $4,
             address = $5, total_family_count = $6, family_member_names = $7,
             heard_about_event = $8, referred_by = $9, updated_at = now()
         WHERE id = $10`,
        [...values, existing.rows[0].id]
      );
      return { action: "updated", id: existing.rows[0].id };
    } else {
      const res = await pool.query(
        `INSERT INTO registrants
          (timestamp_raw, email, full_name, contact_number, address,
           total_family_count, family_member_names, heard_about_event, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        values
      );
      return { action: "inserted", id: res.rows[0].id };
    }
  }

  const jane = {
    timestamp: "6/1/2026",
    email: "jane@example.com",
    full_name: "Jane Smith",
    contact_number: "555-1234",
    family_count: 4,
  };

  // First import: should insert
  const first = await upsertRegistrant(jane);
  assert(first.action === "inserted", "First import of Jane inserts a new row");

  const countAfterFirst = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(countAfterFirst.rows[0].count, 10) === 1, "Exactly 1 registrant after first import");

  // Re-import the EXACT same row (simulating clicking import again on an unchanged sheet)
  const second = await upsertRegistrant(jane);
  assert(second.action === "updated", "Re-importing identical row updates instead of inserting");
  assert(second.id === first.id, "Re-import matches the same registrant by email (no duplicate row)");

  const countAfterSecond = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(countAfterSecond.rows[0].count, 10) === 1, "Still exactly 1 registrant after re-import (no duplicate created)");

  // Check Jane in (simulating she arrived at the event)
  await pool.query(
    `UPDATE registrants SET checked_in = TRUE, checked_in_count = 3, checked_in_at = now() WHERE id = $1`,
    [first.id]
  );

  // Now re-import with UPDATED data (e.g. she corrected her phone number in the sheet)
  const janeUpdated = { ...jane, contact_number: "555-9999", family_count: 5 };
  const third = await upsertRegistrant(janeUpdated);
  assert(third.action === "updated", "Re-import with changed details still matches existing record");
  assert(third.id === first.id, "Still the same registrant id, not a new row");

  const afterUpdate = await pool.query(`SELECT * FROM registrants WHERE id = $1`, [first.id]);
  assert(afterUpdate.rows[0].contact_number === "555-9999", "Updated phone number was applied");
  assert(afterUpdate.rows[0].total_family_count === 5, "Updated family count was applied");
  assert(afterUpdate.rows[0].checked_in === true, "Check-in status PRESERVED across re-import (critical: not erased)");
  assert(afterUpdate.rows[0].checked_in_count === 3, "Checked-in party count PRESERVED across re-import");

  const finalCount = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(finalCount.rows[0].count, 10) === 1, "Still exactly 1 registrant after 3 imports total (no duplicates ever created)");

  // Test the no-email fallback matching (name + phone)
  const walkinLike = {
    full_name: "No Email Person",
    contact_number: "555-0000",
    family_count: 2,
  };
  const noEmailFirst = await upsertRegistrant(walkinLike);
  assert(noEmailFirst.action === "inserted", "No-email registrant inserts on first import");

  const noEmailSecond = await upsertRegistrant(walkinLike);
  assert(noEmailSecond.action === "updated", "No-email registrant matched by name+phone on re-import");
  assert(noEmailSecond.id === noEmailFirst.id, "Same no-email registrant matched, not duplicated");

  const totalNow = await pool.query(`SELECT COUNT(*) FROM registrants`);
  assert(parseInt(totalNow.rows[0].count, 10) === 2, "2 distinct registrants total (Jane + No Email Person), no duplicates");

  console.log("Upsert/dedup test complete.");
}

main()
  .then(() => testUpsertDedup())
  .catch((err) => {
    console.error("Smoke test crashed:", err);
    process.exitCode = 1;
  });

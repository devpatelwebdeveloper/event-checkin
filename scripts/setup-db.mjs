/**
 * Applies src/lib/schema.sql against the configured Postgres database.
 * Usage: POSTGRES_URL="..." node scripts/setup-db.mjs
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set POSTGRES_URL or DATABASE_URL before running this script.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "schema.sql"),
    "utf-8"
  );
  await pool.query(sql);
  console.log("✅ Schema applied successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed to apply schema:", err);
  process.exit(1);
});

/**
 * Run this once after setting up the database schema, to create your first admin login.
 *
 * Usage (locally or via Vercel CLI with env vars pulled):
 *   POSTGRES_URL="..." node scripts/seed-admin.mjs "Your Name" "you@example.com" "yourpassword"
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs "Name" "email@example.com" "password"');
  process.exit(1);
}

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
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING id, name, email, role`,
    [name, email.toLowerCase(), passwordHash]
  );
  console.log("Admin account ready:", result.rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

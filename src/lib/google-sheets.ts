import { google } from "googleapis";

/**
 * Returns an authenticated Google Sheets client using a service account.
 *
 * Requires two env vars (set in Vercel):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - the service account's client_email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - the service account's private_key
 *     (paste exactly as it appears in the downloaded JSON key, including
 *      literal \n sequences - this code converts them to real newlines)
 *
 * Setup (one-time, done by you in Google Cloud Console):
 *   1. Create a project (or use an existing one) at console.cloud.google.com
 *   2. Enable the "Google Sheets API"
 *   3. Create a Service Account (IAM & Admin -> Service Accounts -> Create)
 *   4. Create a JSON key for it and download it
 *   5. Open your Google Sheet -> Share -> paste the service account's email
 *      (looks like xxxx@xxxx.iam.gserviceaccount.com) with Editor access
 *   6. Copy client_email and private_key from the JSON into Vercel env vars
 */
export function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Google Sheets write access isn't configured yet. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in your Vercel environment variables. See src/lib/google-sheets.ts for setup steps."
    );
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export function extractSheetId(urlOrId: string): string {
  // Accepts either a raw sheet ID or a full Google Sheets URL and returns the ID.
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId.trim();
}

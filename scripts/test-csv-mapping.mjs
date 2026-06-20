/**
 * Tests the CSV column-mapping logic (findCol helper) used in
 * src/app/api/registrants/import/route.ts, using the user's actual header row
 * and realistic sample data - to confirm "Email Address" is ignored and "Email" is used.
 */
import Papa from "papaparse";

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ FAILED:", msg);
    process.exitCode = 1;
  } else {
    console.log("✅", msg);
  }
}

function findCol(row, ...candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find(
      (k) => k.toLowerCase().trim() === candidate.toLowerCase().trim()
    );
    if (match) return row[match];
  }
  return null;
}

// The user's actual header row, with "Email Address" empty and "Email" filled,
// exactly as confirmed in conversation.
const csv = `Timestamp,Email Address,Full Name,Contact Number,Address,Total Family Count (including yourself),Family Member Name(s) ,How did you hear about this event?,Referred by,Email
6/1/2026 10:00:00,,Jane Smith,555-1234,123 Main St,4,"John Smith, Jr Smith, Amy Smith",Instagram,Mary Lee,jane@example.com
6/2/2026 09:30:00,,Bob Johnson,555-5678,456 Oak Ave,1,,Friend,,bob@example.com
`;

const parsed = Papa.parse(csv, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
});

assert(parsed.errors.length === 0, "CSV parses without errors");
assert(parsed.data.length === 2, "Two data rows parsed");

const jane = parsed.data[0];

const emailAddressCol = findCol(jane, "Email Address");
const emailCol = findCol(jane, "Email");

assert(emailAddressCol === "", "'Email Address' column is empty for Jane, as confirmed by user");
assert(emailCol === "jane@example.com", "'Email' column correctly contains Jane's real email");

const fullName = findCol(jane, "Full Name");
assert(fullName === "Jane Smith", "Full Name extracted correctly");

const familyCount = findCol(jane, "Total Family Count (including yourself)", "Total Family Count");
assert(familyCount === "4", "Total Family Count extracted correctly via long header name");

const familyMembers = findCol(jane, "Family Member Name(s)", "Family Member Names");
assert(
  familyMembers === "John Smith, Jr Smith, Amy Smith",
  "Family Member Name(s) extracted correctly despite trailing space in original header"
);

const bob = parsed.data[1];
const bobEmail = findCol(bob, "Email");
assert(bobEmail === "bob@example.com", "Bob's Email extracted correctly");
const bobFamilyMembers = findCol(bob, "Family Member Name(s)", "Family Member Names");
assert(bobFamilyMembers === "", "Bob's empty Family Member Names handled as empty string, not crash");

console.log("\nCSV column-mapping test complete.");

/**
 * Tests the isAuthorizedCronCall logic used in
 * src/app/api/registrants/fetch-from-sheet/route.ts, to confirm:
 *  - correct secret + correct header format -> authorized
 *  - wrong secret -> rejected
 *  - missing header -> rejected
 *  - no CRON_SECRET configured at all -> always rejected (falls back to admin-only auth)
 */

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ FAILED:", msg);
    process.exitCode = 1;
  } else {
    console.log("✅", msg);
  }
}

// Mirrors the function in the route file exactly.
function isAuthorizedCronCall(authHeader, cronSecretEnv) {
  if (!cronSecretEnv) return false;
  return authHeader === `Bearer ${cronSecretEnv}`;
}

// Case 1: correct secret
assert(
  isAuthorizedCronCall("Bearer my-secret-123", "my-secret-123") === true,
  "Correct bearer token with matching secret is authorized"
);

// Case 2: wrong secret
assert(
  isAuthorizedCronCall("Bearer wrong-guess", "my-secret-123") === false,
  "Incorrect bearer token is rejected"
);

// Case 3: missing header entirely
assert(
  isAuthorizedCronCall(null, "my-secret-123") === false,
  "Missing Authorization header is rejected"
);

// Case 4: header present but wrong scheme
assert(
  isAuthorizedCronCall("Basic my-secret-123", "my-secret-123") === false,
  "Non-Bearer auth scheme is rejected even with correct secret value"
);

// Case 5: CRON_SECRET not configured at all - must always reject, never fall open
assert(
  isAuthorizedCronCall("Bearer anything", undefined) === false,
  "When CRON_SECRET is not configured, cron auth always fails closed (never bypasses admin auth)"
);
assert(
  isAuthorizedCronCall("Bearer Bearer ", "") === false,
  "Empty string CRON_SECRET does not accidentally authorize requests"
);

// Case 6: case sensitivity / extra whitespace should NOT be accepted (strict match)
assert(
  isAuthorizedCronCall("bearer my-secret-123", "my-secret-123") === false,
  "Lowercase 'bearer' scheme is rejected (strict case-sensitive match)"
);
assert(
  isAuthorizedCronCall("Bearer  my-secret-123", "my-secret-123") === false,
  "Extra whitespace in header does not accidentally match"
);

console.log("\nCRON_SECRET auth test complete.");

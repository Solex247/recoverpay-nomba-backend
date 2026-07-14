// webhook-selfcheck.js
// ─────────────────────────────────────────────────────────────────────────────
// Run this BEFORE submitting your webhook URL to Nomba.
// The announcement says: "Test your endpoint yourself before raising a complaint."
//
// Usage:
//   node webhook-selfcheck.js                     ← tests localhost:3000
//   node webhook-selfcheck.js https://your-app.onrender.com  ← tests live URL
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const crypto = require("crypto");

const TARGET_URL = process.argv[2] || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.NOMBA_WEBHOOK_SECRET || "NombaHackathon2026";

console.log(`\n🔍 RecoverPay Webhook Self-Check`);
console.log(`Target: ${TARGET_URL}`);
console.log(`Secret: ${WEBHOOK_SECRET.slice(0, 8)}...\n`);

function generateSignature(body, timestamp) {
  const merchant = body.data?.merchant || {};
  const transaction = body.data?.transaction || {};
  let responseCode = transaction.responseCode || "";
  if (responseCode === "null") responseCode = "";

  const hashingPayload = [
    body.event_type || "",
    body.requestId || "",
    merchant.userId || "",
    merchant.walletId || "",
    transaction.transactionId || "",
    transaction.type || "",
    transaction.time || "",
    responseCode,
    timestamp,
  ].join(":");

  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(hashingPayload)
    .digest("base64");
}

async function check(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log(`✅ ${result}`);
    return true;
  } catch (err) {
    console.log(`❌ ${err.message}`);
    return false;
  }
}

async function run() {
  let allPassed = true;

  // ── Check 1: Health endpoint ────────────────────────────────────────────
  const healthOk = await check("Health check", async () => {
    const res = await fetch(`${TARGET_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const body = await res.json();
    return `${body.status} (${res.status})`;
  });
  if (!healthOk) allPassed = false;

  // ── Check 2: Webhook endpoint reachable ─────────────────────────────────
  const webhookReachable = await check("Webhook endpoint reachable", async () => {
    // Send with bad signature first — should return 401, not 404 or timeout
    const res = await fetch(`${TARGET_URL}/v1/webhooks/nomba`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "nomba-signature": "bad", "nomba-timestamp": new Date().toISOString() },
      body: JSON.stringify({ event_type: "test" }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) throw new Error("Route not found — check app.ts mounts /v1/webhooks");
    if (res.status === 401) return "Endpoint reachable (signature correctly rejected)";
    return `Status ${res.status}`;
  });
  if (!webhookReachable) allPassed = false;

  // ── Check 3: Signature verification ─────────────────────────────────────
  const timestamp = new Date().toISOString();
  const body = {
    event_type: "payment_success",
    requestId: `selfcheck-${Date.now()}`,
    data: {
      merchant: { userId: "test-user", walletId: "test-wallet" },
      terminal: {},
      transaction: {
        transactionId: `tx-selfcheck-${Date.now()}`,
        type: "online_checkout",
        time: timestamp,
        responseCode: "",
        transactionAmount: 5000,
      },
      order: {
        orderReference: `selfcheck-order-${Date.now()}`,
        customerEmail: "selfcheck@test.com",
      },
    },
  };

  const validSig = await check("Valid signature accepted", async () => {
    const sig = generateSignature(body, timestamp);
    const res = await fetch(`${TARGET_URL}/v1/webhooks/nomba`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "nomba-signature": sig,
        "nomba-timestamp": timestamp,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    return "200 OK — webhook accepted";
  });
  if (!validSig) allPassed = false;

  // ── Check 4: Duplicate rejection ────────────────────────────────────────
  const dupOk = await check("Duplicate event idempotency", async () => {
    // Send same requestId twice — both should return 200
    const sig = generateSignature(body, timestamp);
    const headers = {
      "Content-Type": "application/json",
      "nomba-signature": sig,
      "nomba-timestamp": timestamp,
    };
    const opts = { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) };

    const r1 = await fetch(`${TARGET_URL}/v1/webhooks/nomba`, opts);
    const r2 = await fetch(`${TARGET_URL}/v1/webhooks/nomba`, opts);

    if (r1.status !== 200 || r2.status !== 200) {
      throw new Error(`Got ${r1.status} / ${r2.status} — expected 200 / 200`);
    }
    return "Both calls returned 200 (duplicate silently ignored)";
  });
  if (!dupOk) allPassed = false;

  // ── Check 5: Environment variables ──────────────────────────────────────
  await check("NOMBA_WEBHOOK_SECRET set", async () => {
    if (!process.env.NOMBA_WEBHOOK_SECRET) throw new Error("Not set in .env");
    return "Set";
  });

  await check("NOMBA_SUB_ACCOUNT_ID set", async () => {
    if (!process.env.NOMBA_SUB_ACCOUNT_ID) throw new Error("Not set in .env — sub-account scoping will fail");
    return process.env.NOMBA_SUB_ACCOUNT_ID.slice(0, 8) + "...";
  });

  await check("APP_URL set", async () => {
    if (!process.env.APP_URL) throw new Error("Not set — virtual account callbackUrl will be missing");
    return process.env.APP_URL;
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  if (allPassed) {
    console.log(`✅ All checks passed — your endpoint is ready for Nomba`);
    console.log(`\nSubmit this URL to Nomba:\n  ${TARGET_URL}/v1/webhooks/nomba\n`);
  } else {
    console.log(`❌ Some checks failed — fix issues above before submitting to Nomba`);
    console.log(`\nNomba cannot reach a broken endpoint. Fix first.\n`);
  }
}

run().catch((err) => {
  console.error("\n💥 Self-check crashed:", err.message);
  process.exit(1);
});

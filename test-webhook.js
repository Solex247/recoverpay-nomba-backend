// test-webhook.js
// Run with: node test-webhook.js
// Make sure your server is running first: npm run dev

const crypto = require("crypto");

const WEBHOOK_SECRET = "NombaHackathon2026";
const BASE_URL = "http://localhost:3000";

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

  console.log("\n[signature] Payload to hash:", hashingPayload);

  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(hashingPayload)
    .digest("base64");
}

async function sendWebhook(eventType, data, label) {
  const timestamp = new Date().toISOString();
  const requestId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const body = {
    event_type: eventType,
    requestId,
    data,
  };

  const signature = generateSignature(body, timestamp);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`${"=".repeat(60)}`);

  const res = await fetch(`${BASE_URL}/v1/webhooks/nomba`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": signature,
      "nomba-timestamp": timestamp,
    },
    body: JSON.stringify(body),
  });

  console.log(`Status: ${res.status}`);
  console.log(`Response: ${await res.text()}`);
  return res.status;
}

async function runTests() {
  console.log("🚀 RecoverPay Webhook Test Suite");
  console.log("Make sure your server is running: npm run dev\n");

  // ─── Test 1: Payment success (card) ───────────────────────────────────────
  await sendWebhook(
    "payment_success",
    {
      merchant: {
        userId: "test-user-id",
        walletId: "test-wallet-id",
        walletBalance: 10000,
      },
      terminal: {},
      transaction: {
        transactionId: `tx-card-${Date.now()}`,
        type: "card",
        time: new Date().toISOString(),
        responseCode: "",
        transactionAmount: 5000,
        narration: "Test card payment",
      },
      customer: {
        bankCode: "058",
        cardPan: "506066 **** **** 6666",
      },
    },
    "payment_success (card)"
  );

  await sleep(500);

  // ─── Test 2: Virtual account funded ───────────────────────────────────────
  // Replace accountRef and accountNumber with a real one from your DB
  // Run: npm run db:studio → VirtualAccountAttempt → copy accountRef
  await sendWebhook(
    "payment_success",
    {
      merchant: {
        userId: "test-user-id",
        walletId: "test-wallet-id",
        walletBalance: 15000,
      },
      terminal: {},
      transaction: {
        transactionId: `tx-va-${Date.now()}`,
        type: "vact_transfer",
        time: new Date().toISOString(),
        responseCode: "",
        transactionAmount: 5000,
        narration: "Transfer from TEST CUSTOMER",
        aliasAccountNumber: "REPLACE_WITH_REAL_ACCOUNT_NUMBER",
        aliasAccountReference: "REPLACE_WITH_REAL_ACCOUNT_REF",
        aliasAccountType: "VIRTUAL",
        aliasAccountName: "RecoverPay Test",
      },
      customer: {
        bankCode: "035",
        senderName: "TEST CUSTOMER",
        bankName: "Wema Bank",
        accountNumber: "0000000000",
      },
    },
    "payment_success (virtual account funded)"
  );

  await sleep(500);

  // ─── Test 3: Payment failed ────────────────────────────────────────────────
  await sendWebhook(
    "payment_failed",
    {
      merchant: {
        userId: "test-user-id",
        walletId: "test-wallet-id",
      },
      terminal: {},
      transaction: {
        transactionId: `tx-fail-${Date.now()}`,
        type: "card",
        time: new Date().toISOString(),
        responseCode: "51",
        responseCodeMessage: "Insufficient Funds",
        transactionAmount: 5000,
      },
      customer: {
        cardPan: "506066 **** **** 6674",
      },
    },
    "payment_failed"
  );

  await sleep(500);

  // ─── Test 4: Bad signature (should be rejected) ───────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST: Bad signature (should return 401)");
  console.log(`${"=".repeat(60)}`);

  const res = await fetch(`${BASE_URL}/v1/webhooks/nomba`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": "thisisafakesignature",
      "nomba-timestamp": new Date().toISOString(),
    },
    body: JSON.stringify({ event_type: "payment_success", requestId: "fake" }),
  });

  console.log(`Status: ${res.status} (expected 401)`);
  console.log(`Response: ${await res.text()}`);

  await sleep(500);

  // ─── Test 5: Duplicate event (should be silently ignored) ─────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST: Duplicate requestId (should return 200 silently)");
  console.log(`${"=".repeat(60)}`);

  const dupBody = {
    event_type: "payment_success",
    requestId: "duplicate-test-fixed-id",
    data: {
      merchant: { userId: "u1", walletId: "w1" },
      terminal: {},
      transaction: {
        transactionId: "tx-dup-001",
        type: "card",
        time: new Date().toISOString(),
        responseCode: "",
      },
    },
  };
  const dupTimestamp = new Date().toISOString();
  const dupSig = generateSignature(dupBody, dupTimestamp);

  const dup1 = await fetch(`${BASE_URL}/v1/webhooks/nomba`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": dupSig,
      "nomba-timestamp": dupTimestamp,
    },
    body: JSON.stringify(dupBody),
  });
  console.log(`First call:  ${dup1.status} (expected 200)`);

  const dup2 = await fetch(`${BASE_URL}/v1/webhooks/nomba`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "nomba-signature": dupSig,
      "nomba-timestamp": dupTimestamp,
    },
    body: JSON.stringify(dupBody),
  });
  console.log(`Second call: ${dup2.status} (expected 200 — duplicate ignored)`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ All webhook tests complete");
  console.log("Check your server logs for processing output");
  console.log(`${"=".repeat(60)}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

runTests().catch(console.error);
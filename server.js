require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const app = express();

const WEBHOOK_SECRET = process.env.NOMBA_WEBHOOK_SECRET || "NombaHackathon2026";

// ─── Signature verification ───────────────────────────────────────────────────
function verifySignature(body, headers) {
  const receivedSig = headers["nomba-signature"] || headers["nomba-sig-value"];
  const timestamp = headers["nomba-timestamp"];

  if (!receivedSig || !timestamp) return false;

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

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(hashingPayload)
    .digest("base64");

  return expected === receivedSig;
}

// Health check — confirms the stub is live
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "RecoverPay webhook stub" });
});

// Main webhook endpoint — submit this URL to Nomba
// Full URL: https://<your-render-domain>.onrender.com/webhooks/nomba
app.post("/v1/webhooks/nomba", express.json(), (req, res) => {
  const valid = verifySignature(req.body, req.headers);

  if (!valid) {
    console.warn(
      `[webhook] ⚠️  Signature mismatch — rejected  | Time: ${new Date().toISOString()}`,
    );
    return res.status(401).send("invalid signature");
  }

  const { event_type, requestId } = req.body;
  console.log(
    `[webhook] ✅ Received: ${event_type} | requestId: ${requestId} | Time: ${new Date().toISOString()}`,
  );

  // Always return 200 quickly so Nomba doesn't retry
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ RecoverPay webhook stub running on port ${PORT}`);
  console.log(
    `Submit this URL to Nomba: https://<your-domain>/webhooks/nomba\n`,
  );
});

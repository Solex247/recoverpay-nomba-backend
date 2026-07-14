// src/routes/webhooks.ts
// Multi-tenant webhook handler — identifies tenant by their Nomba accountId
// and verifies signature with THEIR webhook secret

import express from "express";
import crypto from "crypto";
import { db } from "../prisma/client";
import { finalizeFirstPayment } from "../services/checkoutService";
import { notifyCustomer } from "../services/notificationService";
import { getTenantWebhookSecret } from "../nomba/nombaClient";

const router = express.Router();

async function verifyNombaSignature(body: any, headers: any): Promise<boolean> {
  const receivedSig = headers["nomba-signature"] || headers["nomba-sig-value"];
  const timestamp = headers["nomba-timestamp"];
  if (!receivedSig || !timestamp) return false;

  // Identify which tenant this webhook belongs to
  const nombaAccountId = body.data?.merchant?.userId;

  // Get THAT tenant's webhook secret (falls back to system secret)
  const secret = nombaAccountId
    ? await getTenantWebhookSecret(nombaAccountId)
    : (process.env.NOMBA_WEBHOOK_SECRET || "NombaHackathon2026");

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
    .createHmac("sha256", secret)
    .update(hashingPayload)
    .digest("base64");

  return expected === receivedSig;
}

// POST /v1/webhooks/nomba
router.post("/nomba", express.json(), async (req, res) => {
  // 1. Verify signature
  if (!(await verifyNombaSignature(req.body, req.headers))) {
    console.warn("[webhook] Signature mismatch — rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event_type, requestId, data } = req.body;

  // 2. Idempotency — reject duplicates
  try {
    await db.webhookEvent.create({
      data: { requestId, type: event_type, raw: req.body },
    });
  } catch {
    return res.sendStatus(200); // already processed
  }

  // 3. Respond 200 immediately
  res.sendStatus(200);

  // 4. Process async
  try {
    if (event_type === "payment_success") {
      const txType = data?.transaction?.type;

      if (txType === "vact_transfer") {
        await handleVirtualAccountFunded(data);
      } else if (txType === "online_checkout") {
        const orderReference = data?.order?.orderReference;
        if (orderReference) await finalizeFirstPayment(orderReference);
      }
    }

    if (event_type === "payment_failed") {
      console.log("[webhook] payment_failed received", data?.transaction?.transactionId);
    }
  } catch (err) {
    console.error("[webhook] Processing error", err);
  }
});

async function handleVirtualAccountFunded(data: any) {
  const { transaction } = data;

  let va = await db.virtualAccountAttempt.findUnique({
    where: { accountRef: transaction.aliasAccountReference },
  });

  if (!va && transaction.aliasAccountNumber) {
    va = await db.virtualAccountAttempt.findFirst({
      where: { accountNumber: transaction.aliasAccountNumber },
    });
  }

  if (!va) {
    console.warn("[webhook] VA funded but no match found", transaction);
    return;
  }

  const invoice = await db.invoice.findUnique({
    where: { id: va.invoiceId },
    include: { subscription: { include: { customer: true } } },
  });
  if (!invoice || invoice.status === "paid") return;

  const amountReceived = Number(transaction.transactionAmount);
  const amountExpected = Number(va.expectedAmount);

  if (amountReceived < amountExpected) {
    const shortfall = amountExpected - amountReceived;
    console.warn(`[webhook] Short payment: ₦${amountReceived} of ₦${amountExpected}`);

    await notifyCustomer({
      email: invoice.subscription.customer.email,
      subject: "Incomplete payment received",
      message:
        `We received ₦${amountReceived.toLocaleString()} but need ₦${amountExpected.toLocaleString()}. ` +
        `Please transfer the remaining ₦${shortfall.toLocaleString()} to:\n` +
        `Bank: ${va.bankName}\nAccount: ${va.accountNumber}`,
    });
    return;
  }

  await db.virtualAccountAttempt.update({ where: { id: va.id }, data: { status: "funded" } });
  await db.invoice.update({ where: { id: invoice.id }, data: { status: "paid", amountPaid: invoice.amountDue } });
  await db.subscription.update({
    where: { id: invoice.subscriptionId },
    data: { status: "active", dunningAttempt: 0 },
  });

  console.log(`[webhook] VA payment reconciled for invoice ${invoice.id}`);
}

export default router;

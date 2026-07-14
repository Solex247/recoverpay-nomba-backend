// src/workers/billingWorker.ts
// Dunning worker using TENANT's own Nomba credentials

import { Queue, Worker } from "bullmq";
import { bullMQConnection } from "../redis";
import { getTenantNombaClient } from "../nomba/nombaClient";
import { notifyCustomer } from "../services/notificationService";
import { db } from "../prisma/client";
import crypto from "crypto";

export const billingQueue = new Queue("billing", {
  connection: bullMQConnection,
});

export async function scheduleDunning(invoiceId: string) {
  await billingQueue.add(
    "retry-charge",
    { invoiceId, attempt: 1 },
    { delay: 86_400_000 },
  );
  await billingQueue.add(
    "retry-charge",
    { invoiceId, attempt: 2 },
    { delay: 259_200_000 },
  );
  await billingQueue.add(
    "retry-charge",
    { invoiceId, attempt: 3 },
    { delay: 604_800_000 },
  );
  console.log(`[dunning] Scheduled 3 retry attempts for invoice ${invoiceId}`);
}

new Worker(
  "billing",
  async (job) => {
    const { invoiceId, attempt } = job.data;

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          include: {
            customer: true,
            plan: { include: { tenant: true } },
          },
        },
      },
    });

    if (!invoice || invoice.status === "paid") return;
    const sub = invoice.subscription;
    if (sub.status === "cancelled") return;

    // Get THIS tenant's Nomba client
    const nombaClient = await getTenantNombaClient(sub.plan.tenantId).catch(
      (err) => {
        console.error(
          `[dunning] Cannot get Nomba client for tenant ${sub.plan.tenantId}:`,
          err.message,
        );
        return null;
      },
    );

    if (!nombaClient) return;

    if (attempt < 3) {
      await retryCard(invoice, sub, attempt, nombaClient);
    } else {
      await fallbackToVirtualAccount(invoice, sub, nombaClient);
    }
  },
  { connection: bullMQConnection },
);

async function retryCard(
  invoice: any,
  sub: any,
  attempt: number,
  nombaClient: any,
) {
  if (!sub.customer.tokenKey) return;

  const orderReference = `inv_${invoice.id}_retry${attempt}_${crypto.randomUUID()}`;

  const result = await nombaClient.chargeTokenizedCard({
    orderReference,
    customerId: sub.customer.id,
    customerEmail: sub.customer.email,
    amount: Number(invoice.amountDue),
    tokenKey: sub.customer.tokenKey,
  });

  await db.chargeAttempt.create({
    data: {
      invoiceId: invoice.id,
      orderReference,
      status: "pending",
      message: result?.data?.message,
    },
  });

  const verified = await nombaClient.verifyTransaction({ orderReference });
  const isSuccess =
    verified?.data?.success === true || verified?.data?.status === "SUCCESS";

  if (isSuccess) {
    await db.chargeAttempt.update({
      where: { orderReference },
      data: { status: "success" },
    });
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", amountPaid: invoice.amountDue },
    });
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "active", dunningAttempt: 0 },
    });
    await notifyCustomer({
      email: sub.customer.email,
      subject: "Payment successful",
      message: `Your payment of ₦${Number(invoice.amountDue).toLocaleString()} was successful. Your subscription is active.`,
    });
    console.log(
      `[dunning] Attempt ${attempt} succeeded for invoice ${invoice.id}`,
    );
  } else {
    await db.chargeAttempt.update({
      where: { orderReference },
      data: { status: "failed" },
    });
    await db.subscription.update({
      where: { id: sub.id },
      data: { dunningAttempt: attempt },
    });
    await notifyCustomer({
      email: sub.customer.email,
      subject: "Payment failed — we will retry",
      message: `We couldn't charge your card for ₦${Number(invoice.amountDue).toLocaleString()}. We will try again shortly.`,
    });
    console.warn(
      `[dunning] Attempt ${attempt} failed for invoice ${invoice.id}`,
    );
  }
}

async function fallbackToVirtualAccount(
  invoice: any,
  sub: any,
  nombaClient: any,
) {
  const accountRef = `rp_va_${invoice.id}`.slice(0, 64).padEnd(16, "0");
  const accountName = `RecoverPay ${sub.customer.email.split("@")[0]}`
    .slice(0, 64)
    .padEnd(8, " ");
  const expiryDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const result = await nombaClient.createVirtualAccount({
    accountRef,
    accountName,
    expectedAmount: Number(invoice.amountDue),
    expiryDate,
  });

  if (!result?.data?.bankAccountNumber) {
    console.error("[dunning] Virtual account creation failed", {
      invoiceId: invoice.id,
      result,
    });
    return;
  }

  await db.virtualAccountAttempt.create({
    data: {
      invoiceId: invoice.id,
      accountRef,
      accountNumber: result.data.bankAccountNumber,
      bankName: result.data.bankName,
      expectedAmount: invoice.amountDue,
      expiryDate,
    },
  });

  await db.subscription.update({
    where: { id: sub.id },
    data: { status: "past_due", dunningAttempt: 3 },
  });

  await notifyCustomer({
    email: sub.customer.email,
    subject: "Action required — pay via bank transfer",
    message:
      `Your card payment of ₦${Number(invoice.amountDue).toLocaleString()} failed after multiple attempts.\n\n` +
      `Pay via bank transfer within 48 hours:\n` +
      `Bank: ${result.data.bankName}\nAccount: ${result.data.bankAccountNumber}\n` +
      `Amount: ₦${Number(invoice.amountDue).toLocaleString()}`,
  });

  console.log(
    `[dunning] VA fallback created for invoice ${invoice.id}: ${result.data.bankAccountNumber}`,
  );
}

// src/services/billingService.ts
// Uses TENANT's own Nomba credentials for all charges

import { db } from "../prisma/client";
import { getTenantNombaClient } from "../nomba/nombaClient";
import { addInterval } from "../utils/dates";
import crypto from "crypto";

async function getDunningScheduler() {
  const { scheduleDunning } = await import("../workers/billingWorker");
  return scheduleDunning;
}

export async function chargeSubscriptionCycle(subscriptionId: string) {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: true,
      plan: { include: { tenant: true } },
    },
  });

  if (!sub) throw new Error("Subscription not found");
  if (sub.status === "cancelled" || sub.status === "paused") {
    throw new Error(`Cannot charge a ${sub.status} subscription`);
  }

  // Prevent double-billing
  const existingOpen = await db.invoice.findFirst({
    where: { subscriptionId, status: { in: ["open", "draft"] } },
  });
  if (existingOpen) {
    return { invoice: existingOpen, charged: false, reason: "invoice already open" };
  }

  const invoice = await db.invoice.create({
    data: {
      subscriptionId: sub.id,
      status: "open",
      amountDue: sub.plan.amount,
      amountPaid: 0,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    },
  });

  if (!sub.customer.tokenKey) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
    return { invoice, charged: false, reason: "no saved card on file" };
  }

  // Get THIS TENANT's Nomba client
  const nombaClient = await getTenantNombaClient(sub.plan.tenantId).catch(() => null);
  if (!nombaClient) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
    return { invoice, charged: false, reason: "tenant Nomba credentials not configured" };
  }

  const orderReference = `inv_${invoice.id}_${crypto.randomUUID()}`;

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

  if (verified?.data?.success === true || verified?.data?.status === "SUCCESS") {
    const nextStart = sub.currentPeriodEnd;
    const nextEnd = addInterval(nextStart, sub.plan.interval);

    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", amountPaid: invoice.amountDue },
    });
    await db.chargeAttempt.update({
      where: { orderReference },
      data: { status: "success" },
    });
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: "active",
        dunningAttempt: 0,
        currentPeriodStart: nextStart,
        currentPeriodEnd: nextEnd,
        nextBillingDate: nextEnd,
      },
    });
    return { invoice, charged: true };
  }

  // First attempt failed — start dunning
  await db.chargeAttempt.update({ where: { orderReference }, data: { status: "failed" } });
  await db.subscription.update({
    where: { id: sub.id },
    data: { status: "past_due", dunningAttempt: 1 },
  });

  const scheduleDunning = await getDunningScheduler();
  await scheduleDunning(invoice.id);

  return {
    invoice,
    charged: false,
    reason: result?.data?.message || "charge failed — dunning scheduled",
  };
}

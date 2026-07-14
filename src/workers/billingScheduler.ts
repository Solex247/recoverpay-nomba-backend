// src/workers/billingScheduler.ts
import { Queue, Worker } from "bullmq";
import { bullMQConnection } from "../redis";
import { db } from "../prisma/client";
import { chargeSubscriptionCycle } from "../services/billingService";

export const schedulerQueue = new Queue("billing-scheduler", {
  connection: bullMQConnection,
});

export async function startBillingScheduler() {
  const interval =
    Number(process.env.BILLING_CYCLE_INTERVAL_MS) || 60 * 60 * 1000;

  await schedulerQueue.add(
    "run-billing-cycle",
    {},
    {
      repeat: { every: interval },
      jobId: "billing-cycle-cron",
    },
  );

  console.log(`[scheduler] Billing cycle scheduled every ${interval / 1000}s`);
}

new Worker(
  "billing-scheduler",
  async () => {
    const now = new Date();

    const due = await db.subscription.findMany({
      where: {
        status: { in: ["active", "trialing"] },
        nextBillingDate: { lte: now },
      },
    });

    console.log(`[scheduler] ${due.length} subscription(s) due for billing`);

    for (const sub of due) {
      try {
        await chargeSubscriptionCycle(sub.id);
      } catch (err) {
        console.error(`[scheduler] Failed on subscription ${sub.id}:`, err);
      }
    }
  },
  { connection: bullMQConnection },
);

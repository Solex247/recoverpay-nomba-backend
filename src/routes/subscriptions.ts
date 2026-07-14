import express from "express";
import { db } from "../prisma/client";
import { requireTenant, AuthedRequest } from "../middleware/auth";
import { chargeSubscriptionCycle } from "../services/billingService";

const router = express.Router();
router.use(requireTenant);

// GET /v1/subscriptions — list all subscriptions for this tenant
router.get("/", async (req: AuthedRequest, res) => {
  const { status } = req.query;

  const subscriptions = await db.subscription.findMany({
    where: {
      plan: { tenantId: req.tenantId! },
      ...(status ? { status: status as string } : {}),
    },
    include: { customer: true, plan: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(subscriptions);
});

// GET /v1/subscriptions/:id — get a single subscription
router.get("/:id", async (req: AuthedRequest, res) => {
  const sub = await db.subscription.findFirst({
    where: { id: req.params.id, plan: { tenantId: req.tenantId! } },
    include: { customer: true, plan: true, invoices: true },
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  res.json(sub);
});

// POST /v1/subscriptions/:id/charge
// Manually triggers a billing cycle charge.
// Useful during the demo — no need to wait for the scheduler to fire.
router.post("/:id/charge", async (req: AuthedRequest, res) => {
  const sub = await db.subscription.findFirst({
    where: { id: req.params.id, plan: { tenantId: req.tenantId! } },
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  try {
    const result = await chargeSubscriptionCycle(sub.id);
    // 200 = charged successfully, 402 = charge failed (dunning scheduled)
    res.status(result.charged ? 200 : 402).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

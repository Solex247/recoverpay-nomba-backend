// src/routes/plans.ts
// Requires Nomba credentials before creating plans

import express from "express";
import { db } from "../prisma/client";
import { requireTenant, AuthedRequest } from "../middleware/auth";

const router = express.Router();
router.use(requireTenant);

// Check Nomba config for write operations
async function requireNombaConfig(req: AuthedRequest, res: any, next: any) {
  const config = await db.tenantNombaConfig.findUnique({
    where: { tenantId: req.tenantId! },
  });
  if (!config || !config.verified) {
    return res.status(400).json({
      error: "Connect your Nomba account first.",
      hint: "Go to Settings → Connect Nomba Account before creating plans.",
    });
  }
  next();
}

// POST /v1/plans — requires Nomba config
router.post("/", requireNombaConfig, async (req: AuthedRequest, res) => {
  const { name, amount, interval, trialDays, currency } = req.body;

  if (!name || amount == null || !interval) {
    return res.status(400).json({ error: "name, amount, and interval are required" });
  }
  if (!["monthly", "annual", "custom"].includes(interval)) {
    return res.status(400).json({ error: "interval must be monthly, annual, or custom" });
  }
  if (isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "amount must be a positive number in Naira" });
  }

  const plan = await db.plan.create({
    data: {
      tenantId: req.tenantId!,
      name,
      amount,
      currency: currency || "NGN",
      interval,
      trialDays: trialDays || 0,
    },
  });

  res.status(201).json(plan);
});

// GET /v1/plans — no Nomba config required for reads
router.get("/", async (req: AuthedRequest, res) => {
  const plans = await db.plan.findMany({
    where: { tenantId: req.tenantId!, archived: false },
    orderBy: { createdAt: "desc" },
  });
  res.json(plans);
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const plan = await db.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(plan);
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const plan = await db.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  const { name, amount, trialDays } = req.body;
  const updated = await db.plan.update({
    where: { id: plan.id },
    data: {
      ...(name && { name }),
      ...(amount != null && { amount }),
      ...(trialDays != null && { trialDays }),
    },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const plan = await db.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  await db.plan.update({ where: { id: plan.id }, data: { archived: true } });
  res.status(204).send();
});

export default router;

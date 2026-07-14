import express from "express";
import { db } from "../prisma/client";
import { addInterval } from "../utils/dates";

const router = express.Router();

// GET /v1/portal/:customerId — customer overview + subscriptions
router.get("/:customerId", async (req, res) => {
  const customer = await db.customer.findUnique({
    where: { id: req.params.customerId },
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  res.json({
    id: customer.id,
    email: customer.email,
    hasCard: !!customer.tokenKey,
    subscriptions: customer.subscriptions,
  });
});

// GET /v1/portal/:customerId/invoices — invoice history
router.get("/:customerId/invoices", async (req, res) => {
  const invoices = await db.invoice.findMany({
    where: { subscription: { customerId: req.params.customerId } },
    include: { chargeAttempts: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(invoices);
});

// POST /v1/portal/:customerId/subscriptions/:subId/cancel
router.post("/:customerId/subscriptions/:subId/cancel", async (req, res) => {
  const sub = await db.subscription.findFirst({
    where: { id: req.params.subId, customerId: req.params.customerId },
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  if (sub.status === "cancelled") {
    return res.status(400).json({ error: "Subscription is already cancelled" });
  }

  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: { status: "cancelled" },
  });
  res.json(updated);
});

// POST /v1/portal/:customerId/subscriptions/:subId/pause
router.post("/:customerId/subscriptions/:subId/pause", async (req, res) => {
  const sub = await db.subscription.findFirst({
    where: { id: req.params.subId, customerId: req.params.customerId },
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  if (sub.status !== "active") {
    return res.status(400).json({ error: `Cannot pause a ${sub.status} subscription` });
  }

  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: { status: "paused" },
  });
  res.json(updated);
});

// POST /v1/portal/:customerId/subscriptions/:subId/resume
router.post("/:customerId/subscriptions/:subId/resume", async (req, res) => {
  const sub = await db.subscription.findFirst({
    where: { id: req.params.subId, customerId: req.params.customerId },
    include: { plan: true },
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  if (sub.status !== "paused") {
    return res.status(400).json({ error: `Cannot resume a ${sub.status} subscription` });
  }

  // Shift next charge a full cycle from now — don't bill for time paused
  const nextBillingDate = addInterval(new Date(), sub.plan.interval);

  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: { status: "active", nextBillingDate },
  });
  res.json(updated);
});

// PATCH /v1/portal/:customerId/card
// Nomba has no direct card update API — the correct path is a new checkout
// session with tokenizeCard:true, which overwrites the stored tokenKey.
router.patch("/:customerId/card", (_req, res) => {
  res.status(501).json({
    error: "To update your card, start a new checkout via POST /v1/checkout/start",
  });
});

export default router;

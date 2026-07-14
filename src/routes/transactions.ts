// src/routes/transactions.ts
import express from "express";
import { db } from "../prisma/client";
import { requireTenant, AuthedRequest } from "../middleware/auth";

const router = express.Router();
router.use(requireTenant);

// GET /v1/transactions
// Returns all charge attempts (transactions) for this tenant
router.get("/", async (req: AuthedRequest, res) => {
  const { status, limit = "50", offset = "0" } = req.query;

  const where: any = {
    invoice: {
      subscription: {
        plan: { tenantId: req.tenantId! },
      },
    },
  };

  if (status) where.status = status as string;

  const [transactions, total] = await Promise.all([
    db.chargeAttempt.findMany({
      where,
      include: {
        invoice: {
          include: {
            subscription: {
              include: {
                customer: true,
                plan: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: Number(offset),
    }),
    db.chargeAttempt.count({ where }),
  ]);

  const formatted = transactions.map((tx) => ({
    id: tx.id,
    orderReference: tx.orderReference,
    status: tx.status,
    message: tx.message,
    amount: tx.invoice.amountDue,
    currency: "NGN",
    customerEmail: tx.invoice.subscription.customer.email,
    planName: tx.invoice.subscription.plan.name,
    subscriptionId: tx.invoice.subscriptionId,
    invoiceId: tx.invoiceId,
    createdAt: tx.createdAt,
  }));

  res.json({
    transactions: formatted,
    total,
    limit: Number(limit),
    offset: Number(offset),
  });
});

// GET /v1/transactions/summary
// Quick stats for the dashboard
router.get("/summary", async (req: AuthedRequest, res) => {
  const plans = await db.plan.findMany({
    where: { tenantId: req.tenantId! },
    select: { id: true },
  });
  const planIds = plans.map((p) => p.id);

  const [
    totalSuccessful,
    totalFailed,
    totalRevenue,
    activeSubscriptions,
    pastDue,
  ] = await Promise.all([
    db.chargeAttempt.count({
      where: {
        status: "success",
        invoice: { subscription: { plan: { tenantId: req.tenantId! } } },
      },
    }),
    db.chargeAttempt.count({
      where: {
        status: "failed",
        invoice: { subscription: { plan: { tenantId: req.tenantId! } } },
      },
    }),
    db.invoice.aggregate({
      where: {
        status: "paid",
        subscription: { plan: { tenantId: req.tenantId! } },
      },
      _sum: { amountPaid: true },
    }),
    db.subscription.count({
      where: { status: "active", plan: { tenantId: req.tenantId! } },
    }),
    db.subscription.count({
      where: { status: "past_due", plan: { tenantId: req.tenantId! } },
    }),
  ]);

  res.json({
    totalSuccessful,
    totalFailed,
    totalRevenue: totalRevenue._sum.amountPaid || 0,
    activeSubscriptions,
    pastDue,
    recoveryRate:
      totalSuccessful + totalFailed > 0
        ? Math.round((totalSuccessful / (totalSuccessful + totalFailed)) * 100)
        : 0,
  });
});

export default router;

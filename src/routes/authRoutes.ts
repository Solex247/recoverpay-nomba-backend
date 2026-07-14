// src/routes/authRoutes.ts
import express from "express";
import crypto from "crypto";
import { db } from "../prisma/client";
import { requireClerkAuth, ClerkAuthRequest } from "../middleware/clerkAuth";

const router = express.Router();

function generateApiKey(): string {
  return `rp_sk_${crypto.randomBytes(32).toString("hex")}`;
}

// POST /v1/auth/register
// Called by the frontend after Clerk signup.
// Creates Tenant record + generates API key. Safe to call multiple times.
router.post("/register", requireClerkAuth, async (req: ClerkAuthRequest, res) => {
  const { clerkUserId, email, name } = req.clerkUser!;

  try {
    const existing = await db.tenant.findUnique({ where: { clerkUserId } });

    if (existing) {
      return res.json({
        tenant: {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          apiKey: existing.apiKey,
        },
        created: false,
      });
    }

    const tenant = await db.tenant.create({
      data: {
        name: name || email?.split("@")[0] || "My Company",
        email,
        clerkUserId,
        apiKey: generateApiKey(),
      },
    });

    return res.status(201).json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        apiKey: tenant.apiKey,
      },
      created: true,
    });
  } catch (err) {
    console.error("[auth] Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// GET /v1/auth/me
// Returns current tenant profile, stats, and Nomba connection status.
router.get("/me", requireClerkAuth, async (req: ClerkAuthRequest, res) => {
  const tenant = await db.tenant.findUnique({
    where: { clerkUserId: req.clerkUser!.clerkUserId },
    include: {
      _count: { select: { plans: true } },
      nombaConfig: { select: { verified: true } },
    },
  });

  if (!tenant) {
    return res
      .status(404)
      .json({ error: "Tenant not found. Please register first." });
  }

  const activeSubscriptions = await db.subscription.count({
    where: { plan: { tenantId: tenant.id }, status: "active" },
  });

  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    apiKey: tenant.apiKey,
    plan: tenant.plan,
    nombaConnected: !!tenant.nombaConfig?.verified,
    stats: {
      totalPlans: tenant._count.plans,
      activeSubscriptions,
    },
  });
});

// POST /v1/auth/regenerate-key
// Generates a new API key. The old key immediately stops working.
router.post(
  "/regenerate-key",
  requireClerkAuth,
  async (req: ClerkAuthRequest, res) => {
    const tenant = await db.tenant.findUnique({
      where: { clerkUserId: req.clerkUser!.clerkUserId },
    });

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const newApiKey = generateApiKey();
    await db.tenant.update({
      where: { id: tenant.id },
      data: { apiKey: newApiKey },
    });

    res.json({
      apiKey: newApiKey,
      message: "API key regenerated. Your old key no longer works.",
    });
  }
);

// PATCH /v1/auth/profile
// Update tenant display name.
router.patch("/profile", requireClerkAuth, async (req: ClerkAuthRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const tenant = await db.tenant.findUnique({
    where: { clerkUserId: req.clerkUser!.clerkUserId },
  });

  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const updated = await db.tenant.update({
    where: { id: tenant.id },
    data: { name },
  });

  res.json({ id: updated.id, name: updated.name, email: updated.email });
});

export default router;

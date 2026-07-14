// src/routes/nombaConfig.ts
import express from "express";
import { db } from "../prisma/client";
import { requireTenant, AuthedRequest } from "../middleware/auth";
import { encrypt, decrypt } from "../utils/encryption";
import { NombaClient } from "../nomba/nombaClient";

const router = express.Router();
router.use(requireTenant);

// POST /v1/nomba/connect
// Validates and stores tenant's Nomba credentials
router.post("/connect", async (req: AuthedRequest, res) => {
  const {
    nombaAccountId,
    nombaSubAccountId,
    nombaClientId,
    nombaClientSecret,
    nombaWebhookSecret,
    baseUrl,
  } = req.body;

  if (!nombaAccountId || !nombaSubAccountId || !nombaClientId || !nombaClientSecret) {
    return res.status(400).json({
      error: "All fields required: nombaAccountId, nombaSubAccountId, nombaClientId, nombaClientSecret",
    });
  }

  // Test the credentials before storing
  const testClient = new NombaClient({
    accountId: nombaAccountId,
    subAccountId: nombaSubAccountId,
    clientId: nombaClientId,
    clientSecret: nombaClientSecret,
    baseUrl: baseUrl || "https://sandbox.nomba.com",
    tokenCacheKey: `nomba:token:test:${req.tenantId}`,
  });

  const valid = await testClient.testCredentials();
  if (!valid) {
    return res.status(400).json({
      error: "Invalid Nomba credentials. Please check your Account ID, Client ID, and Client Secret.",
      hint: "Make sure you are using TEST credentials against the sandbox URL.",
    });
  }

  // Credentials are valid — encrypt sensitive fields and store
  const config = await db.tenantNombaConfig.upsert({
    where: { tenantId: req.tenantId! },
    create: {
      tenantId: req.tenantId!,
      nombaAccountId,
      nombaSubAccountId,
      nombaClientId,
      clientSecretEncrypted: encrypt(nombaClientSecret),
      webhookSecretEncrypted: nombaWebhookSecret ? encrypt(nombaWebhookSecret) : null,
      baseUrl: baseUrl || "https://sandbox.nomba.com",
      verified: true,
    },
    update: {
      nombaAccountId,
      nombaSubAccountId,
      nombaClientId,
      clientSecretEncrypted: encrypt(nombaClientSecret),
      webhookSecretEncrypted: nombaWebhookSecret ? encrypt(nombaWebhookSecret) : null,
      baseUrl: baseUrl || "https://sandbox.nomba.com",
      verified: true,
      updatedAt: new Date(),
    },
  });

  res.json({
    connected: true,
    nombaAccountId: config.nombaAccountId,
    nombaSubAccountId: config.nombaSubAccountId,
    nombaClientId: config.nombaClientId,
    baseUrl: config.baseUrl,
    message: "Nomba account connected and verified successfully.",
  });
});

// GET /v1/nomba/status
// Returns whether tenant has configured Nomba credentials
router.get("/status", async (req: AuthedRequest, res) => {
  const config = await db.tenantNombaConfig.findUnique({
    where: { tenantId: req.tenantId! },
  });

  if (!config) {
    return res.json({
      connected: false,
      message: "No Nomba credentials configured. Connect your account to start using RecoverPay.",
    });
  }

  // Never return secrets — only metadata
  res.json({
    connected: true,
    verified: config.verified,
    nombaAccountId: config.nombaAccountId,
    nombaSubAccountId: config.nombaSubAccountId,
    nombaClientId: config.nombaClientId,
    baseUrl: config.baseUrl,
    hasWebhookSecret: !!config.webhookSecretEncrypted,
    connectedAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
});

// POST /v1/nomba/test
// Tests existing stored credentials without changing them
router.post("/test", async (req: AuthedRequest, res) => {
  const config = await db.tenantNombaConfig.findUnique({
    where: { tenantId: req.tenantId! },
  });

  if (!config) {
    return res.status(404).json({ error: "No credentials stored. Connect first." });
  }

  const clientSecret = decrypt(config.clientSecretEncrypted);
  const testClient = new NombaClient({
    accountId: config.nombaAccountId,
    subAccountId: config.nombaSubAccountId,
    clientId: config.nombaClientId,
    clientSecret,
    baseUrl: config.baseUrl,
    tokenCacheKey: `nomba:token:test:${req.tenantId}`,
  });

  const valid = await testClient.testCredentials();

  if (!valid) {
    await db.tenantNombaConfig.update({
      where: { tenantId: req.tenantId! },
      data: { verified: false },
    });
    return res.status(400).json({
      connected: false,
      error: "Stored credentials no longer work. Please reconnect.",
    });
  }

  res.json({ connected: true, message: "Credentials verified successfully." });
});

// DELETE /v1/nomba/disconnect
// Removes Nomba credentials
router.delete("/disconnect", async (req: AuthedRequest, res) => {
  const config = await db.tenantNombaConfig.findUnique({
    where: { tenantId: req.tenantId! },
  });

  if (!config) {
    return res.status(404).json({ error: "No credentials to disconnect." });
  }

  await db.tenantNombaConfig.delete({ where: { tenantId: req.tenantId! } });

  res.json({ connected: false, message: "Nomba account disconnected." });
});

export default router;

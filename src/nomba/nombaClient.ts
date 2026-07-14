// src/nomba/nombaClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant NombaClient class.
// Each tenant uses their OWN Nomba credentials.
// Tokens cached per-tenant in Redis: "nomba:token:{tenantId}"
// ─────────────────────────────────────────────────────────────────────────────

import { redisConnection as redis } from "../redis";
import { db } from "../prisma/client";
import { safeDecrypt } from "../utils/encryption";

export function toNombaAmount(amount: number): string {
  return amount.toFixed(2);
}

// ─── NombaClient class ────────────────────────────────────────────────────────
export class NombaClient {
  private accountId: string;
  private subAccountId: string;
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private tokenCacheKey: string;

  constructor(config: {
    accountId: string;
    subAccountId: string;
    clientId: string;
    clientSecret: string;
    baseUrl?: string;
    tokenCacheKey?: string;
  }) {
    this.accountId = config.accountId;
    this.subAccountId = config.subAccountId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl || "https://sandbox.nomba.com";
    this.tokenCacheKey = config.tokenCacheKey || `nomba:token:system`;
  }

  // ── Token management ────────────────────────────────────────────────────────
  async getAccessToken(): Promise<string> {
    const cached = await redis.get(this.tokenCacheKey);
    if (cached) return cached;

    const res = await fetch(`${this.baseUrl}/v1/auth/token/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: this.accountId,
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    const json = await res.json();
    const token = json?.data?.access_token;
    if (!token) {
      throw new Error(`Nomba auth failed: ${json?.description || JSON.stringify(json)}`);
    }

    await redis.setex(this.tokenCacheKey, 3300, token);
    console.log(`[nomba] Token refreshed for ${this.tokenCacheKey}`);
    return token;
  }

  // ── Base request ────────────────────────────────────────────────────────────
  async request(method: string, path: string, body?: object): Promise<any> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        accountId: this.accountId,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) console.error(`[nomba] ${method} ${path} failed:`, data);
    return data;
  }

  // ── Checkout order (funds routed to sub-account) ────────────────────────────
  async createCheckoutOrder(params: {
    orderReference: string;
    customerId: string;
    customerEmail: string;
    amount: number;
    callbackUrl: string;
  }) {
    const isSandbox = this.baseUrl.includes("sandbox");
    const path = isSandbox ? "/sandbox/checkout/order" : "/v1/checkout/order";
    return this.request("POST", path, {
      order: {
        orderReference: params.orderReference,
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        amount: toNombaAmount(params.amount),
        currency: "NGN",
        callbackUrl: params.callbackUrl,
        accountId: this.subAccountId, // funds go to sub-account
        tokenizeCard: true,
      },
    });
  }

  // ── Tokenized card charge ───────────────────────────────────────────────────
  async chargeTokenizedCard(params: {
    orderReference: string;
    customerId: string;
    customerEmail: string;
    amount: number;
    tokenKey: string;
  }) {
    return this.request("POST", "/v1/checkout/tokenized-card-payment", {
      order: {
        orderReference: params.orderReference,
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        amount: toNombaAmount(params.amount),
        currency: "NGN",
        accountId: this.subAccountId,
      },
      tokenKey: params.tokenKey,
    });
  }

  // ── Transaction verification ────────────────────────────────────────────────
  async verifyTransaction(params: {
    orderReference?: string;
    transactionRef?: string;
  }) {
    const isSandbox = this.baseUrl.includes("sandbox");
    if (isSandbox) {
      const idType = params.orderReference ? "orderReference" : "orderId";
      const id = params.orderReference || params.transactionRef;
      return this.request("GET", `/sandbox/checkout/transaction?idType=${idType}&id=${id}`);
    }
    const query = params.orderReference
      ? `orderReference=${params.orderReference}`
      : `transactionRef=${params.transactionRef}`;
    return this.request("GET", `/v1/transactions/accounts/single?${query}`);
  }

  // ── Get latest card token ───────────────────────────────────────────────────
  async getLatestTokenForCustomer(customerEmail: string): Promise<string | null> {
    const result = await this.request(
      "GET",
      `/v1/checkout/tokenized-card-data?customerEmail=${encodeURIComponent(customerEmail)}`
    );
    const list = result?.data?.tokenizedCardDataList;
    return Array.isArray(list) && list.length > 0 ? list[0].tokenKey : null;
  }

  // ── Virtual account ─────────────────────────────────────────────────────────
  async createVirtualAccount(params: {
    accountRef: string;
    accountName: string;
    expectedAmount: number;
    expiryDate: Date;
  }) {
    const formattedExpiry = params.expiryDate
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    const result = await this.request("POST", "/v1/accounts/virtual", {
      accountRef: params.accountRef,
      accountName: params.accountName,
      expectedAmount: toNombaAmount(params.expectedAmount),
      expiryDate: formattedExpiry,
      callbackUrl: process.env.APP_URL
        ? `${process.env.APP_URL}/v1/webhooks/nomba`
        : undefined,
    });
    if (result?.code !== "00") {
      console.error("[nomba] Virtual account creation failed:", result);
    }
    return result;
  }

  // ── Test credentials (used during credential validation) ───────────────────
  async testCredentials(): Promise<boolean> {
    try {
      // Clear any cached token first to force a fresh auth attempt
      await redis.del(this.tokenCacheKey);
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}

// ─── System client (env vars — for demo/testing) ─────────────────────────────
export const systemNombaClient = new NombaClient({
  accountId: process.env.NOMBA_ACCOUNT_ID || "",
  subAccountId: process.env.NOMBA_SUB_ACCOUNT_ID || "",
  clientId: process.env.NOMBA_CLIENT_ID || "",
  clientSecret: process.env.NOMBA_CLIENT_SECRET || "",
  baseUrl: process.env.NOMBA_BASE_URL || "https://sandbox.nomba.com",
  tokenCacheKey: "nomba:token:system",
});

// ─── Get tenant-specific client ───────────────────────────────────────────────
export async function getTenantNombaClient(tenantId: string): Promise<NombaClient> {
  const config = await db.tenantNombaConfig.findUnique({
    where: { tenantId },
  });

  if (!config || !config.verified) {
    throw new Error(
      "Nomba credentials not configured. Go to Dashboard → Settings → Connect Nomba Account."
    );
  }

  const clientSecret = safeDecrypt(config.clientSecretEncrypted);
  if (!clientSecret) throw new Error("Failed to decrypt Nomba credentials");

  return new NombaClient({
    accountId: config.nombaAccountId,
    subAccountId: config.nombaSubAccountId,
    clientId: config.nombaClientId,
    clientSecret,
    baseUrl: config.baseUrl,
    tokenCacheKey: `nomba:token:${tenantId}`,
  });
}

// ─── Get tenant webhook secret ────────────────────────────────────────────────
export async function getTenantWebhookSecret(nombaAccountId: string): Promise<string> {
  const config = await db.tenantNombaConfig.findFirst({
    where: { nombaAccountId },
  });

  if (config?.webhookSecretEncrypted) {
    const secret = safeDecrypt(config.webhookSecretEncrypted);
    if (secret) return secret;
  }

  // Fallback to system webhook secret (hackathon participants use NombaHackathon2026)
  return process.env.NOMBA_WEBHOOK_SECRET || "NombaHackathon2026";
}

// ─── Backwards compatibility exports ─────────────────────────────────────────
// These use the system client for situations where tenantId isn't available
export async function nombaRequest(method: string, path: string, body?: object) {
  return systemNombaClient.request(method, path, body);
}

// ─── Legacy compatibility (used in some old route files) ──────────────────────
export async function chargeTokenizedCard(params: {
  orderReference: string; customerId: string; customerEmail: string;
  amount: number; tokenKey: string;
}) { return systemNombaClient.chargeTokenizedCard(params); }

export async function verifyTransaction(params: { orderReference?: string; transactionRef?: string; }) {
  return systemNombaClient.verifyTransaction(params);
}

export async function getLatestTokenForCustomer(email: string) {
  return systemNombaClient.getLatestTokenForCustomer(email);
}

export async function createVirtualAccount(params: {
  accountRef: string; accountName: string; expectedAmount: number; expiryDate: Date;
}) { return systemNombaClient.createVirtualAccount(params); }

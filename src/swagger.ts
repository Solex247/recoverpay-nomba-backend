// src/swagger.ts
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const spec = {
  openapi: "3.0.0",
  info: {
    title: "RecoverPay API",
    version: "2.0.0",
    description:
      "Managed subscriptions engine with intelligent payment recovery for Nigerian businesses, built on Nomba. Each tenant connects their own Nomba account — payments go directly to their wallet.",
  },
  servers: [{ url: "/v1", description: "API v1" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "http",
        scheme: "bearer",
        description: "Tenant API key — starts with rp_sk_. Get from Settings page.",
      },
      ClerkAuth: {
        type: "http",
        scheme: "bearer",
        description: "Clerk JWT — used by the dashboard frontend only.",
      },
    },
  },
  tags: [
    { name: "System", description: "Health and docs" },
    { name: "Auth", description: "Tenant registration and API key management (Clerk JWT)" },
    { name: "Nomba", description: "Connect and manage your Nomba merchant credentials" },
    { name: "Plans", description: "Subscription plan management" },
    { name: "Checkout", description: "Start subscriptions and handle payments" },
    { name: "Subscriptions", description: "Manage subscription lifecycle" },
    { name: "Transactions", description: "View all charge history and stats" },
    { name: "Portal", description: "Customer self-service (no auth required)" },
    { name: "Webhooks", description: "Nomba payment event receiver" },
  ],
  paths: {
    // ── System ──────────────────────────────────────────────────────────────
    "/health": {
      get: {
        summary: "Server health check",
        tags: ["System"],
        security: [],
        responses: { "200": { description: "Server is running" } },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    "/auth/register": {
      post: {
        summary: "Register tenant after Clerk signup",
        description: "Called automatically by the dashboard on first load. Creates Tenant record and generates API key. Safe to call multiple times (idempotent).",
        tags: ["Auth"],
        security: [{ ClerkAuth: [] }],
        responses: {
          "201": { description: "Tenant created with API key" },
          "200": { description: "Tenant already exists — returned existing record" },
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get tenant profile and stats",
        description: "Returns tenant details, API key, Nomba connection status, and dashboard stats.",
        tags: ["Auth"],
        security: [{ ClerkAuth: [] }],
        responses: { "200": { description: "Tenant profile" }, "404": { description: "Not registered" } },
      },
    },
    "/auth/regenerate-key": {
      post: {
        summary: "Regenerate API key",
        description: "Generates a new rp_sk_ key. The old key stops working immediately. Update all your integrations.",
        tags: ["Auth"],
        security: [{ ClerkAuth: [] }],
        responses: { "200": { description: "New API key" } },
      },
    },
    "/auth/profile": {
      patch: {
        summary: "Update display name",
        tags: ["Auth"],
        security: [{ ClerkAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "Updated profile" } },
      },
    },

    // ── Nomba Config ─────────────────────────────────────────────────────────
    "/nomba/connect": {
      post: {
        summary: "Connect Nomba merchant account",
        description: "Validates credentials against Nomba's API, then encrypts and stores them. Plan creation is blocked until this succeeds.",
        tags: ["Nomba"],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nombaAccountId", "nombaSubAccountId", "nombaClientId", "nombaClientSecret"],
                properties: {
                  nombaAccountId: { type: "string", example: "f666ef9b-888e-4799-85ce-acb505b28023" },
                  nombaSubAccountId: { type: "string", example: "435f41eb-53f6-41a9-a16f-c2e300accd09" },
                  nombaClientId: { type: "string", example: "706df6c4-b8bb-4130-88c4-d21b052f8631" },
                  nombaClientSecret: { type: "string", example: "k8UobYk3..." },
                  nombaWebhookSecret: { type: "string", example: "NombaHackathon2026" },
                  baseUrl: { type: "string", example: "https://sandbox.nomba.com" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Connected and verified" },
          "400": { description: "Invalid credentials or missing fields" },
        },
      },
    },
    "/nomba/status": {
      get: {
        summary: "Nomba connection status",
        description: "Returns whether this tenant has valid Nomba credentials. Never returns the secret itself.",
        tags: ["Nomba"],
        security: [{ ApiKeyAuth: [] }],
        responses: { "200": { description: "Connection status" } },
      },
    },
    "/nomba/test": {
      post: {
        summary: "Test stored credentials",
        description: "Re-validates stored Nomba credentials without changing them.",
        tags: ["Nomba"],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          "200": { description: "Credentials still valid" },
          "400": { description: "Credentials no longer work" },
        },
      },
    },
    "/nomba/disconnect": {
      delete: {
        summary: "Remove Nomba credentials",
        description: "Deletes stored credentials. Plans and checkout will stop working until reconnected.",
        tags: ["Nomba"],
        security: [{ ApiKeyAuth: [] }],
        responses: { "200": { description: "Disconnected" } },
      },
    },

    // ── Plans ────────────────────────────────────────────────────────────────
    "/plans": {
      post: {
        summary: "Create a plan",
        description: "Requires Nomba account to be connected first.",
        tags: ["Plans"],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "amount", "interval"],
                properties: {
                  name: { type: "string", example: "Pro Monthly" },
                  amount: { type: "number", example: 5000, description: "Naira amount" },
                  interval: { type: "string", enum: ["monthly", "annual", "custom"] },
                  trialDays: { type: "integer", example: 7 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Plan created" },
          "400": { description: "Validation error or Nomba not connected" },
        },
      },
      get: {
        summary: "List plans",
        tags: ["Plans"],
        security: [{ ApiKeyAuth: [] }],
        responses: { "200": { description: "Array of active plans" } },
      },
    },
    "/plans/{id}": {
      get: {
        summary: "Get a plan",
        tags: ["Plans"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Plan" }, "404": { description: "Not found" } },
      },
      patch: {
        summary: "Update a plan",
        tags: ["Plans"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  amount: { type: "number" },
                  trialDays: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated plan" } },
      },
      delete: {
        summary: "Archive a plan",
        tags: ["Plans"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Archived" } },
      },
    },

    // ── Checkout ─────────────────────────────────────────────────────────────
    "/checkout/start": {
      post: {
        summary: "Start a subscription checkout",
        description: "Uses this tenant's Nomba credentials. Funds go to their Nomba sub-account.",
        tags: ["Checkout"],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["customerEmail", "planId"],
                properties: {
                  customerEmail: { type: "string", example: "customer@example.com" },
                  planId: { type: "string" },
                  callbackUrl: { type: "string", example: "https://yourapp.com/success" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Returns checkoutUrl to redirect customer" },
          "400": { description: "Nomba not connected or invalid planId" },
        },
      },
    },
    "/checkout/complete": {
      get: {
        summary: "Payment return URL — Nomba redirects here",
        description: "Do not call this manually. Nomba redirects customer here after payment.",
        tags: ["Checkout"],
        security: [],
        parameters: [{ name: "orderReference", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Payment confirmed" }, "402": { description: "Payment failed" } },
      },
    },
    "/checkout/status": {
      get: {
        summary: "Check payment status by orderReference",
        tags: ["Checkout"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "orderReference", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Payment status" }, "404": { description: "Not found" } },
      },
    },

    // ── Subscriptions ─────────────────────────────────────────────────────────
    "/subscriptions": {
      get: {
        summary: "List subscriptions",
        tags: ["Subscriptions"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["active", "trialing", "past_due", "paused", "cancelled"] },
          },
        ],
        responses: { "200": { description: "Array of subscriptions" } },
      },
    },
    "/subscriptions/{id}": {
      get: {
        summary: "Get a subscription",
        tags: ["Subscriptions"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Subscription with invoices" }, "404": { description: "Not found" } },
      },
    },
    "/subscriptions/{id}/charge": {
      post: {
        summary: "Manually trigger a billing cycle",
        description: "Uses tenant Nomba credentials. The scheduler calls this automatically.",
        tags: ["Subscriptions"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Charged successfully" },
          "402": { description: "Charge failed — dunning scheduled" },
        },
      },
    },

    // ── Transactions ──────────────────────────────────────────────────────────
    "/transactions": {
      get: {
        summary: "List all transactions",
        description: "All charge attempts for this tenant's subscriptions.",
        tags: ["Transactions"],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["success", "failed", "pending"] } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", example: 50 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", example: 0 } },
        ],
        responses: { "200": { description: "Transactions array with total count" } },
      },
    },
    "/transactions/summary": {
      get: {
        summary: "Transaction summary stats",
        description: "Returns total revenue, success/fail counts, recovery rate, and subscription counts.",
        tags: ["Transactions"],
        security: [{ ApiKeyAuth: [] }],
        responses: { "200": { description: "Summary stats" } },
      },
    },

    // ── Portal ────────────────────────────────────────────────────────────────
    "/portal/{customerId}": {
      get: {
        summary: "Customer overview",
        tags: ["Portal"],
        security: [],
        parameters: [{ name: "customerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Customer + subscriptions" } },
      },
    },
    "/portal/{customerId}/invoices": {
      get: {
        summary: "Customer invoice history",
        tags: ["Portal"],
        security: [],
        parameters: [{ name: "customerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Invoices" } },
      },
    },
    "/portal/{customerId}/subscriptions/{subId}/pause": {
      post: {
        summary: "Pause subscription",
        tags: ["Portal"],
        security: [],
        parameters: [
          { name: "customerId", in: "path", required: true, schema: { type: "string" } },
          { name: "subId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paused" }, "400": { description: "Already paused or wrong state" } },
      },
    },
    "/portal/{customerId}/subscriptions/{subId}/resume": {
      post: {
        summary: "Resume subscription",
        tags: ["Portal"],
        security: [],
        parameters: [
          { name: "customerId", in: "path", required: true, schema: { type: "string" } },
          { name: "subId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Resumed" } },
      },
    },
    "/portal/{customerId}/subscriptions/{subId}/cancel": {
      post: {
        summary: "Cancel subscription",
        tags: ["Portal"],
        security: [],
        parameters: [
          { name: "customerId", in: "path", required: true, schema: { type: "string" } },
          { name: "subId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Cancelled" } },
      },
    },

    // ── Webhooks ──────────────────────────────────────────────────────────────
    "/webhooks/nomba": {
      post: {
        summary: "Nomba webhook receiver",
        description: "Called by Nomba — not for manual use. Identifies the tenant by merchant.userId in the payload, verifies signature with that tenant's webhook secret, then processes payment events.",
        tags: ["Webhooks"],
        security: [],
        responses: {
          "200": { description: "Acknowledged" },
          "401": { description: "Invalid signature" },
        },
      },
    },
  },
};

export function mountSwagger(app: Express) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
}

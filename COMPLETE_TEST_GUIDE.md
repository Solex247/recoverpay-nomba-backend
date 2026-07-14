# RecoverPay — Complete Testing Guide (v2)
### 29 Endpoints | Bruno + Swagger | Multi-tenant with Nomba Credentials

---

## WHAT IS NEW IN THIS VERSION

- Tenants must connect their own Nomba account before creating plans
- Each tenant's charges use THEIR OWN Nomba credentials
- New /v1/nomba/* endpoints for credential management
- New /v1/transactions/* endpoints for viewing all charge history
- Webhook now identifies tenant by their Nomba accountId
- Plan creation blocked until Nomba credentials are connected and verified

---

## SETUP — DO THESE FIRST

### Step 1 — Generate encryption key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy output → add to .env:
```
ENCRYPTION_KEY=paste64hexcharshere
```

### Step 2 — Run migration
```bash
npx prisma migrate dev --name add-nomba-config
```

### Step 3 — Install new dependencies
```bash
npm install @clerk/backend cors
npm install -D @types/cors
```

### Step 4 — Start server
```bash
npm run dev
```

---

## YOUR HACKATHON CREDENTIALS

```
API Key (seed):         rp_test_demo_key_123456
Nomba Parent ID:        f666ef9b-888e-4799-85ce-acb505b28023
Nomba Sub-Account ID:   435f41eb-53f6-41a9-a16f-c2e300accd09
Nomba Client ID:        706df6c4-b8bb-4130-88c4-d21b052f8631
Nomba Client Secret:    k8UobYk3APgOoxUnNL7VpuxzwTsH4LsXtydfjcHs8RH0YISBB4OMqJsaafG+U8fWETu9YZ96bNXE+DelCDuMPw==
Webhook Secret:         NombaHackathon2026
Success card:           5434621074252808
PIN:                    1234
OTP (success):          9999
Declined card:          5484497218317651
Base URL:               http://localhost:3000
Swagger:                http://localhost:3000/docs
```

---

## BRUNO ENVIRONMENT VARIABLES

| Variable | Value |
|----------|-------|
| base_url | http://localhost:3000 |
| api_key | rp_test_demo_key_123456 |
| plan_id | (fill after Test 8) |
| sub_id | (fill after Test 12) |
| customer_id | (fill after Test 14) |

---

## ALL TESTS IN ORDER

### TEST 1 — Health Check
```
GET {{base_url}}/health
```
Expected: { "status": "ok" }

---

### TEST 2 — Webhook Self-Check
```bash
node webhook-selfcheck.js
```
All 7 checks green before continuing.

---

### TEST 3 — Check Nomba Status (Before Connecting)
```
GET   {{base_url}}/v1/nomba/status
Auth: Bearer {{api_key}}
```
Expected: { "connected": false }

---

### TEST 4 — Connect Nomba Account *** DO THIS BEFORE PLANS ***
```
POST  {{base_url}}/v1/nomba/connect
Auth: Bearer {{api_key}}
Body:
```
```json
{
  "nombaAccountId": "f666ef9b-888e-4799-85ce-acb505b28023",
  "nombaSubAccountId": "435f41eb-53f6-41a9-a16f-c2e300accd09",
  "nombaClientId": "706df6c4-b8bb-4130-88c4-d21b052f8631",
  "nombaClientSecret": "k8UobYk3APgOoxUnNL7VpuxzwTsH4LsXtydfjcHs8RH0YISBB4OMqJsaafG+U8fWETu9YZ96bNXE+DelCDuMPw==",
  "nombaWebhookSecret": "NombaHackathon2026",
  "baseUrl": "https://sandbox.nomba.com"
}
```
What happens: backend tests credentials against Nomba, encrypts the secret with AES-256, stores in TenantNombaConfig table.

Expected (200): { "connected": true, "message": "Nomba account connected and verified successfully." }

If error: check clientSecret copied correctly from your hackathon email.

---

### TEST 5 — Verify Nomba Status After Connecting
```
GET   {{base_url}}/v1/nomba/status
Auth: Bearer {{api_key}}
```
Expected: { "connected": true, "verified": true }
Note: clientSecret is NEVER returned — only metadata.

---

### TEST 6 — Test Stored Credentials
```
POST  {{base_url}}/v1/nomba/test
Auth: Bearer {{api_key}}
```
Expected: { "connected": true, "message": "Credentials verified successfully." }

---

### TEST 7 — Prove Plans Blocked Without Nomba (Optional Edge Case)
Disconnect first:
```
DELETE {{base_url}}/v1/nomba/disconnect
Auth: Bearer {{api_key}}
```
Then try creating a plan:
```
POST  {{base_url}}/v1/plans
Auth: Bearer {{api_key}}
Body: { "name": "Test", "amount": 1000, "interval": "monthly" }
```
Expected (400): { "error": "Connect your Nomba account first." }

Reconnect (repeat Test 4) before continuing.

---

### TEST 8 — Create A Plan
```
POST  {{base_url}}/v1/plans
Auth: Bearer {{api_key}}
Body:
```
```json
{
  "name": "Pro Monthly",
  "amount": 5000,
  "interval": "monthly",
  "trialDays": 7
}
```
Expected (201): Plan created.
SAVE: plan_id from response.

---

### TEST 9 — List Plans
```
GET   {{base_url}}/v1/plans
Auth: Bearer {{api_key}}
```

### TEST 10 — Get Single Plan
```
GET   {{base_url}}/v1/plans/{{plan_id}}
Auth: Bearer {{api_key}}
```

### TEST 11 — Update Plan
```
PATCH {{base_url}}/v1/plans/{{plan_id}}
Auth: Bearer {{api_key}}
Body: { "name": "Pro Monthly (Updated)" }
```

---

### TEST 12 — Start Checkout
```
POST  {{base_url}}/v1/checkout/start
Auth: Bearer {{api_key}}
Body:
```
```json
{
  "customerEmail": "testcustomer@example.com",
  "planId": "{{plan_id}}",
  "callbackUrl": "http://localhost:3000/v1/checkout/complete"
}
```
Expected (200): { "checkoutUrl": "https://...", "subscriptionId": "..." }
SAVE: subscriptionId as sub_id.

---

### TEST 13 — Complete Payment (Browser)
1. Open checkoutUrl in browser
2. Card: 5434621074252808
3. PIN: 1234
4. OTP: 9999
5. See: { "success": true }

Watch terminal for:
[nomba] Token refreshed for nomba:token:TENANT_ID
[webhook] Received: payment_success

---

### TEST 14 — Confirm Subscription Active
```
GET   {{base_url}}/v1/subscriptions/{{sub_id}}
Auth: Bearer {{api_key}}
```
Check: status=active, tokenKey!=null, invoices[0].status=paid
SAVE: customer.id as customer_id.

---

### TEST 15 — Check Payment Status
```
GET   {{base_url}}/v1/checkout/status?orderReference=PASTE_REF_HERE
Auth: Bearer {{api_key}}
```
Get orderReference from Prisma Studio > ChargeAttempt table.

---

### TEST 16 — List All Transactions (NEW)
```
GET   {{base_url}}/v1/transactions
Auth: Bearer {{api_key}}
```
Expected: { "transactions": [...], "total": 1 }

---

### TEST 17 — Filter Transactions
```
GET   {{base_url}}/v1/transactions?status=success
GET   {{base_url}}/v1/transactions?status=failed
Auth: Bearer {{api_key}}
```

---

### TEST 18 — Transaction Summary (NEW)
```
GET   {{base_url}}/v1/transactions/summary
Auth: Bearer {{api_key}}
```
Expected: { "totalSuccessful": 1, "totalRevenue": "5000", "recoveryRate": 100 }

---

### TEST 19 — Trigger Billing Cycle
```
POST  {{base_url}}/v1/subscriptions/{{sub_id}}/charge
Auth: Bearer {{api_key}}
```
Uses YOUR stored Nomba credentials to charge the card.
Expected (200): { "charged": true }

---

### TEST 20 — Dunning Flow
Enable short delays in billingWorker.ts (5s/10s/15s).
Trigger failing charge. Watch terminal logs.
Restore delays after.

---

### TEST 21 — List Subscriptions
```
GET   {{base_url}}/v1/subscriptions
GET   {{base_url}}/v1/subscriptions?status=active
Auth: Bearer {{api_key}}
```

---

### TEST 22 — Pause Subscription
```
POST  {{base_url}}/v1/portal/{{customer_id}}/subscriptions/{{sub_id}}/pause
```

### TEST 23 — Resume Subscription
```
POST  {{base_url}}/v1/portal/{{customer_id}}/subscriptions/{{sub_id}}/resume
```

### TEST 24 — Cancel Subscription
Create throwaway sub, then:
```
POST  {{base_url}}/v1/portal/CUSTOMER_ID/subscriptions/SUB_ID/cancel
```

---

### TEST 25 — Customer Portal
```
GET   {{base_url}}/v1/portal/{{customer_id}}
GET   {{base_url}}/v1/portal/{{customer_id}}/invoices
```

---

### TEST 26 — Bad Webhook Signature
```
POST  {{base_url}}/v1/webhooks/nomba
Headers: nomba-signature: fakesig, nomba-timestamp: 2026-07-05T10:00:00Z
Body:    { "event_type": "payment_success", "requestId": "fake" }
```
Expected (401): { "error": "Invalid signature" }

---

### TEST 27 — Archive Plan
```
DELETE {{base_url}}/v1/plans/{{plan_id}}
Auth: Bearer {{api_key}}
```
Expected: 204 No Content.

---

## ALL 29 ENDPOINTS

| # | Method | Endpoint | Auth | Purpose |
|---|--------|----------|------|---------|
| 1 | GET | /health | none | Server health |
| 2 | GET | /docs | none | Swagger UI |
| 3 | POST | /v1/auth/register | Clerk JWT | Create tenant |
| 4 | GET | /v1/auth/me | Clerk JWT | Profile + stats |
| 5 | POST | /v1/auth/regenerate-key | Clerk JWT | New API key |
| 6 | PATCH | /v1/auth/profile | Clerk JWT | Update name |
| 7 | POST | /v1/nomba/connect | API key | Connect Nomba |
| 8 | GET | /v1/nomba/status | API key | Connection status |
| 9 | POST | /v1/nomba/test | API key | Test credentials |
| 10 | DELETE | /v1/nomba/disconnect | API key | Remove credentials |
| 11 | POST | /v1/plans | API key | Create plan |
| 12 | GET | /v1/plans | API key | List plans |
| 13 | GET | /v1/plans/:id | API key | Get plan |
| 14 | PATCH | /v1/plans/:id | API key | Update plan |
| 15 | DELETE | /v1/plans/:id | API key | Archive plan |
| 16 | POST | /v1/checkout/start | API key | Start checkout |
| 17 | GET | /v1/checkout/complete | none | Payment redirect |
| 18 | GET | /v1/checkout/status | API key | Payment status |
| 19 | GET | /v1/subscriptions | API key | List subscriptions |
| 20 | GET | /v1/subscriptions/:id | API key | Get subscription |
| 21 | POST | /v1/subscriptions/:id/charge | API key | Trigger billing |
| 22 | GET | /v1/transactions | API key | All transactions |
| 23 | GET | /v1/transactions/summary | API key | Stats |
| 24 | GET | /v1/portal/:cId | none | Customer portal |
| 25 | GET | /v1/portal/:cId/invoices | none | Invoices |
| 26 | POST | /v1/portal/:cId/subscriptions/:sId/pause | none | Pause |
| 27 | POST | /v1/portal/:cId/subscriptions/:sId/resume | none | Resume |
| 28 | POST | /v1/portal/:cId/subscriptions/:sId/cancel | none | Cancel |
| 29 | POST | /v1/webhooks/nomba | none | Nomba events |

---

## ERROR REFERENCE

| Error | Cause | Fix |
|-------|-------|-----|
| Connect your Nomba account first | No credentials | Run POST /v1/nomba/connect |
| Invalid Nomba credentials | Wrong secret | Check hackathon email |
| ENCRYPTION_KEY is not set | Missing env | Generate 64-char hex + add to .env |
| Tenant Nomba credentials not configured | Not connected | POST /v1/nomba/connect |
| 502 on checkout/start | Nomba API call failing | Check NOMBA_BASE_URL = https://sandbox.nomba.com |

---

## DEMO VIDEO SEQUENCE (3 minutes)

1. Open Swagger at localhost:3000/docs
2. GET /health — show server live
3. POST /v1/nomba/connect — show credential verification
4. POST /v1/nomba/status — show connected + verified
5. POST /v1/plans — create Pro Monthly plan
6. POST /v1/checkout/start — get checkout URL
7. Browser: pay with card 5434621074252808, PIN 1234, OTP 9999
8. GET /v1/subscriptions/:id — show status: active
9. GET /v1/transactions/summary — show revenue stats
10. POST /v1/subscriptions/:id/charge — trigger dunning (with short delays)
11. Terminal: show dunning retries firing → VA created
12. POST /v1/portal/:id/subscriptions/:id/pause — customer self-service

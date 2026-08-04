# RecoverPay

> Managed recurring-billing and payment-recovery engine built on Nomba. Stripe Billing for Nigerian businesses.

**Nomba × DevCareer Hackathon 2026 | Track: Subscriptions Engine**

---

## Live URLs

| | URL |
|--|--|
| Frontend | https://recover-pay.vercel.app |
| Backend | https://your-backend.onrender.com |
| API Docs | https://your-backend.onrender.com/docs |

---

## What It Does

```
Card charge fails
      ↓
Retry at 24h → Retry at 72h
      ↓
Generate Nomba virtual account
Email customer: "Pay ₦5,000 to GTBank 0123456789"
      ↓
Customer transfers → Webhook fires → Subscription reactivated ✅
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon) + Prisma |
| Queue | BullMQ + Upstash Redis |
| Payments | Nomba API (per-tenant credentials) |
| Auth | Clerk + API Keys |
| Email | Resend |
| Frontend | Next.js 15, Tailwind, Clerk |
| Hosting | Render + Vercel |

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Configure .env
```bash
cp .env.example .env
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database
```bash
npx prisma migrate dev --name init
npm run db:seed
```

### 4. Run
```bash
npm run dev
```

### 5. Verify webhook
```bash
node webhook-selfcheck.js
```

---

## All 29 Endpoints

### Auth (Clerk JWT)
```
POST   /v1/auth/register
GET    /v1/auth/me
POST   /v1/auth/regenerate-key
PATCH  /v1/auth/profile
```

### Nomba Credentials (API Key)
```
POST   /v1/nomba/connect
GET    /v1/nomba/status
POST   /v1/nomba/test
DELETE /v1/nomba/disconnect
```

### Plans (API Key)
```
POST   /v1/plans
GET    /v1/plans
GET    /v1/plans/:id
PATCH  /v1/plans/:id
DELETE /v1/plans/:id
```

### Checkout (API Key)
```
POST   /v1/checkout/start
GET    /v1/checkout/complete
GET    /v1/checkout/status
```

### Subscriptions (API Key)
```
GET    /v1/subscriptions
GET    /v1/subscriptions/:id
POST   /v1/subscriptions/:id/charge
```

### Transactions (API Key)
```
GET    /v1/transactions
GET    /v1/transactions/summary
```

### Portal (Public)
```
GET    /v1/portal/:cId
GET    /v1/portal/:cId/invoices
POST   /v1/portal/:cId/subscriptions/:sId/pause
POST   /v1/portal/:cId/subscriptions/:sId/resume
POST   /v1/portal/:cId/subscriptions/:sId/cancel
```

### System
```
GET    /health
GET    /docs
POST   /v1/webhooks/nomba
```

---

## Security
- HMAC-SHA256 webhook signature verification
- AES-256-CBC credential encryption
- Idempotent webhook processing (requestId unique index)
- Unique orderReference per charge attempt

---

## Deployment

**Backend → Render**
- Build: `npm install && npx prisma migrate deploy`
- Start: `npm start`

**Frontend → Vercel**
- Connect GitHub repo, add env vars, deploy

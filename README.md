# recoverpay-nomba-webhook
This is a webhook service for Devcareer X Nomba Hackathon 
# RecoverPay Nomba Webhook Stub

A lightweight Express.js webhook receiver for **Nomba Payment Webhooks**.

This project demonstrates how to securely receive, verify, and process webhook events from Nomba using **HMAC SHA256 signature verification**.

It also includes a complete automated test suite for validating webhook behavior before integrating with production systems.

---

## Features

- Secure HMAC SHA256 signature verification
- Webhook endpoint for Nomba events
- Health check endpoint
- Environment variable support
- Detailed logging
- Automated webhook testing script
- Ready for deployment on Render, Railway or any Node.js hosting platform

---

## Project Structure

```
.
├── server.js             # Express webhook server
├── test-webhook.js       # Automated webhook test suite
├── package.json
├── .env
└── README.md
```

---

## Installation

Clone the repository.

```bash
git clone https://github.com/<your-username>/recoverpay-nomba-webhook.git
```

Enter the project.

```bash
cd recoverpay-nomba-webhook
```

Install dependencies.

```bash
npm install
```

---

## Environment Variables

Create a `.env` file.

```env
PORT=3000
NOMBA_WEBHOOK_SECRET=NombaHackathon2026
```

The webhook secret **must match** the secret configured on Nomba.

---

## Running the Server

Development

```bash
npm run dev
```

or

```bash
node server.js
```

You should see

```
RecoverPay webhook stub running on port 3000

Submit this URL to Nomba:
https://<your-domain>/v1/webhooks/nomba
```

---

## Endpoints

### Health Check

```
GET /health
```

Response

```json
{
  "status": "ok",
  "service": "RecoverPay webhook stub"
}
```

---

### Webhook Endpoint

```
POST /v1/webhooks/nomba
```

This endpoint receives webhook events from Nomba.

---

## Signature Verification

Every incoming request is verified before processing.

The server computes an HMAC SHA256 signature using:

```
event_type
requestId
merchant.userId
merchant.walletId
transaction.transactionId
transaction.type
transaction.time
transaction.responseCode
timestamp
```

These fields are concatenated using a colon (`:`).

Example payload used for hashing:

```
payment_success:req123:user1:wallet1:tx001:card:2026-01-01T12:00:00Z::2026-01-01T12:00:00Z
```

The payload is hashed using

```
HMAC SHA256
```

with the shared webhook secret.

The generated Base64 signature is compared against the incoming header:

```
nomba-signature
```

along with

```
nomba-timestamp
```

If the signatures match, the request is accepted.

Otherwise the server responds

```
401 Unauthorized
```

---

## Successful Request

Example response

```
HTTP 200 OK
```

Console output

```
[webhook] Received:
payment_success

requestId:
req123

Time:
2026-07-01T15:40:18.000Z
```

---

## Invalid Signature

Example response

```
HTTP 401 Unauthorized
```

Console output

```
Signature mismatch — rejected
```

---

# Testing

A complete automated test suite is included.

```
test-webhook.js
```

Run it with

```bash
node test-webhook.js
```

or

```bash
npm run test:webhook
```

*(if configured in package.json)*

---

## Test Coverage

The test suite verifies several webhook scenarios.

### Test 1

Payment Success (Card)

Checks

- valid signature
- successful payment
- HTTP 200 response

---

### Test 2

Virtual Account Funding

Simulates a customer funding a virtual account.

Checks

- valid signature
- virtual account payload
- HTTP 200 response

**Note**

Replace

```
REPLACE_WITH_REAL_ACCOUNT_NUMBER
```

and

```
REPLACE_WITH_REAL_ACCOUNT_REF
```

with actual values from your database if testing real virtual accounts.

---

### Test 3

Payment Failed

Simulates

```
payment_failed
```

using

```
responseCode = 51
```

(Insufficient Funds)

Expected

```
200 OK
```

---

### Test 4

Invalid Signature

Sends a fake signature.

Expected

```
401 Unauthorized
```

---

### Test 5

Duplicate Event

Sends the exact same webhook twice.

Expected

```
200 OK
```

both times.

In a production implementation the second event should be ignored after checking the stored `requestId`.

---

## Example Test Output

```
============================================================
TEST: payment_success (card)
============================================================

Status: 200

Response: OK

============================================================
TEST: payment_success (virtual account funded)
============================================================

Status: 200

============================================================
TEST: payment_failed
============================================================

Status: 200

============================================================
TEST: Bad signature
============================================================

Status: 401

============================================================
TEST: Duplicate requestId
============================================================

First call: 200

Second call: 200

============================================================
All webhook tests complete
============================================================
```

---

## Logging

Successful webhook

```
[webhook] Received:
payment_success

requestId:
req123

Time:
2026-07-01T14:52:12.312Z
```

Rejected webhook

```
[webhook] Signature mismatch — rejected

Time:
2026-07-01T14:52:12.312Z
```

---

## Deployment

This project is compatible with

- Render
- Railway
- Fly.io
- DigitalOcean
- Heroku
- AWS EC2
- VPS

After deployment your webhook URL becomes

```
https://your-domain.com/v1/webhooks/nomba
```

Register this URL on the Nomba dashboard.

---

## Production Recommendations

For production systems you should additionally implement:

- Request ID deduplication
- Database persistence
- Retry handling
- Structured logging
- Monitoring
- Alerting
- Queue processing (BullMQ, RabbitMQ, SQS, etc.)
- Timestamp freshness validation to prevent replay attacks
- HTTPS only
- Rate limiting
- Idempotency keys

---

## Security Notes

Always

- verify webhook signatures
- use HTTPS
- keep your webhook secret private
- reject invalid signatures
- return HTTP 200 quickly after successful verification
- process long-running work asynchronously

---

## Tech Stack

- Node.js
- Express.js
- Crypto (Node built-in)
- dotenv

---

## License

MIT

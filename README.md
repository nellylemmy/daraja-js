# daraja-js

> Type-safe Node.js / TypeScript SDK for Safaricom Daraja (M-Pesa). It handles the production gotchas that quietly break real PayBills, so your team does not meet them during an outage. By [KEPAS Technologies](https://kepas.co.ke), Loitokitok, Kajiado County, Kenya.

[![npm](https://img.shields.io/npm/v/@kepas/daraja-js.svg)](https://www.npmjs.com/package/@kepas/daraja-js)
[![CI](https://github.com/kepas-tech/daraja-js/actions/workflows/ci.yml/badge.svg)](https://github.com/kepas-tech/daraja-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Types](https://img.shields.io/badge/types-included-blue.svg)](#typescript)

> **Stable (1.x).** The public API follows [SemVer](https://semver.org) — breaking changes bump the major. Live-tested against production M-Pesa. See the [roadmap](./ROADMAP.md) for what's next.

> **Not affiliated with or endorsed by Safaricom PLC.** "Daraja" is the public name of Safaricom's M-Pesa Open API; this is an independent, community toolkit. See [TRADEMARK.md](./TRADEMARK.md).

---

## Why this exists

The Daraja API works. The trouble is the many small behaviours that are not written down — they pass in sandbox and fail in production. Phone numbers that must be JSON numbers. Balances packed into one pipe-delimited string. Callbacks that never retry. Most teams on M-Pesa find these the hard way, often in the middle of an incident.

`daraja-js` comes from running a real PayBill (Safaricom shortcode `4052037`), turned into a typed SDK. Each gotcha below is a bug we hit in production and now stop — in the types, or in the request layer.

## Install

```bash
npm install @kepas/daraja-js
# or
pnpm add @kepas/daraja-js
```

Node 20+. Ships ESM + CJS + types. Works in Node, Bun, and Cloudflare Workers (WebCrypto-backed webhook verification).

> **Before you go live, read [PREREQUISITES.md](./PREREQUISITES.md).** It lists — per API — the exact Safaricom credentials, the Daraja **product** you must enable on your app, and the operator **role** / Go-Live each capability requires. The code is ready; Safaricom controls access, and a missing product returns `401 "no apiproduct match found"`.

## Quickstart

### ESM

```ts
import { Daraja, DarajaInsufficientFundsError } from '@kepas/daraja-js';

const daraja = new Daraja({
  consumerKey: process.env.MPESA_CONSUMER_KEY!,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
  shortcode: '600999',                // your own shortcode (600999 = Safaricom sandbox)
  passkey: process.env.MPESA_PASSKEY!,
  environment: 'sandbox',             // 'sandbox' | 'production'
  maxNetworkRetries: 2,
  // Required for the initiator-authed APIs (b2c.*, b2b.*, status.transaction, reversal):
  // initiator: process.env.MPESA_INITIATOR!,
  // securityCredential: await generateSecurityCredential({ … }),  // RSA-encrypt the initiator password
  // Required for Bill Manager invoicing (the key billManager.optIn returns):
  // billManagerAppKey: process.env.MPESA_BILLMANAGER_APP_KEY!,
});

const res = await daraja.collect.stkPush({
  phone: '0712345678',                // any of 5 formats — normalized internally
  amount: 100,
  accountReference: 'INV-001',
  description: 'Subscription payment',
  callbackUrl: 'https://pay.example.com/webhooks/mpesa/stk',
});

console.log(res.checkoutRequestId);
```

### CJS

```js
const { Daraja } = require('@kepas/daraja-js');
```

### Sharing the OAuth token across workers (Redis)

By default the token is cached per-process. To share one token across many
workers, pass a `tokenStore` — two functions over any backend (the SDK has no
Redis dependency):

```ts
import Redis from 'ioredis';
const redis = new Redis();

const daraja = new Daraja({
  /* …creds… */
  tokenStore: {
    get: (key) => redis.get(key),
    set: (key, value, ttlSeconds) => redis.set(key, value, 'EX', ttlSeconds).then(() => undefined),
  },
});
```

The in-memory cache still runs first — Redis is read only when the local token is
missing or expired. Keys are kept separate per environment and consumer key.

### Receiving the STK result (Daraja callback)

Safaricom POSTs the async result to your `callbackUrl`. Daraja does **not** sign
it, so pair this with an IP allowlist for Safaricom's ranges.

```ts
import { parseStkCallback } from '@kepas/daraja-js';

app.post('/webhooks/mpesa/stk', express.json(), (req, res) => {
  const result = parseStkCallback(req.body);
  if (result.success) {
    // result.mpesaReceiptNumber, result.amount, result.phoneNumber
  }
  res.status(200).end(); // ALWAYS 200 to Safaricom
});
```

### C2B — direct PayBill/Till payments

Register your callback URLs once, then handle the validation + confirmation
callbacks. The confirmation is **terminal** — money is already settled and
Safaricom won't retry it, so always reply 200.

```ts
import { parseC2bConfirmation, c2bAccept, c2bReject } from '@kepas/daraja-js';

// one-time setup
await daraja.c2b.registerUrls({
  confirmationUrl: 'https://example.com/c2b/confirm',
  validationUrl: 'https://example.com/c2b/validate',
});

// validation (optional): accept or reject before the payment completes
app.post('/c2b/validate', express.json(), (req, res) => res.json(c2bAccept()));

// confirmation: money is in — record it, always 200
app.post('/c2b/confirm', express.json(), (req, res) => {
  const p = parseC2bConfirmation(req.body); // p.transId, p.amount, p.msisdn, p.billRefNumber
  res.status(200).end();
});
```

### B2C — pay out to a customer phone

Money out. Needs initiator auth — set `initiator` + `securityCredential` on the
client. B2C draws from your **Utility** account (gotcha #7), so fund it first.

```ts
import { Daraja, generateSecurityCredential, parseB2cResult } from '@kepas/daraja-js';

const daraja = new Daraja({
  consumerKey, consumerSecret, shortcode: '600999', passkey, environment: 'sandbox',
  initiator: 'apitest',
  // one-time: RSA-encrypt your initiator password with Safaricom's cert
  securityCredential: generateSecurityCredential({ password, certPath: './certs/sandbox.cer' }),
});

const ack = await daraja.b2c.send({
  phone: '0712345678',
  amount: 500,
  resultUrl: 'https://example.com/b2c/result',
  queueTimeoutUrl: 'https://example.com/b2c/timeout',
  remarks: 'Refund',
});

// async result lands at resultUrl:
app.post('/b2c/result', express.json(), (req, res) => {
  const r = parseB2cResult(req.body); // r.success, r.mpesaReceipt, r.amount, r.recipientName
  res.status(200).end();
});
```

### Re-emitting signed webhooks (Stripe-compatible)

For platforms built on daraja-js that forward events to their own consumers —
sign on send, verify on receive. Works on Node and edge runtimes.

```ts
import { webhooks } from '@kepas/daraja-js';

app.post('/webhooks/mpesa/stk',
  express.raw({ type: 'application/json' }),   // RAW bytes — not parsed JSON
  async (req, res) => {
    const event = await webhooks.constructEventAsync({
      payload: req.body,
      signature: req.headers['x-daraja-signature'] as string,
      secret: process.env.MPESA_WEBHOOK_SECRET!,
    });
    // ... handle event ...
    res.status(200).end();                      // ALWAYS 200 to Safaricom
  }
);
```

## The gotchas it defeats

These are real production failures, built into the SDK so you never meet them:

| # | Gotcha | How the SDK handles it |
|---|--------|------------------------|
| 1 | STK `PartyA`/`PhoneNumber` must be JSON **numbers** — strings silently time out (ResultCode 1037) | Cast after normalization, enforced by the request type |
| 2 | Phone numbers arrive in many formats — `07XX` **and** the newer `01XX`, plus `+254…`, `254…`, bare 9-digit, and a hashed (SHA-256 hex) MSISDN | `normalizePhone()`, tested across all ranges |
| 3 | Timestamp is `YYYYMMDDHHMMSS` UTC, zero-padded | Generated internally |
| 4 | STK password = `base64(shortcode + passkey + timestamp)`, order matters | Derived for you |
| 5 | B2B callback URL is **shared** between float transfers and B2B payments | Typed callback parsers + optional router helper |
| 6 | Balance is pipe-delimited, accounts `&`-joined | `parseBalance()` returns a typed struct |
| 7 | B2C draws from the **Utility** account, not Working | Config-time warning when float is untopped |
| 8 | C2B confirmation is **terminal** — no second callback | Parser sets `terminal: true` |
| 9 | Safaricom does **not** retry C2B callbacks | Pull Transaction recovery cookbook |
| 10 | Pull Transaction 3.0: no `/mpesa/` prefix, `NominatedNumber` is MSISDN not shortcode, `OffSetValue` is a number | Correct paths + typed params |
| 11 | Always return 200 to callbacks, even on bad payloads | Helper returns 200 + persists for replay |
| 12 | OAuth token TTL 3599s | Cached per-environment, race-safe |
| 13 | Prod vs sandbox base URLs | Single `environment` flag |
| 14 | Bank withdrawal is **not** API-automatable | Documented; no misleading stub |

Two more come as helpers: amounts of 100 KES or less on B2B PayBill are free (the SDK assumes no fee), and a reversal that failed because the recipient already spent the money — `isSettledByRecipientSpend()` — which Safaricom only tells you through the free-text `resultDesc`.

## What's covered

**Collection (money in):**

- `collect.stkPush` + `parseStkCallback` — STK Push, with the gotcha-defeating validation layer; parse the async result Safaricom posts back.
- `c2b.registerUrls` + `parseC2bConfirmation` / `parseC2bValidation` + `c2bAccept` / `c2bReject` — capture direct PayBill/Till payments (confirmation is terminal — gotcha #8).
- `bonga.calculatePoints` + `bonga.redeem` — Lipa na Bonga: convert Bonga points→KES and redeem them as payment (settles via the C2B confirmation callback).

**Disbursement (money out):**

- `b2c.send` + `parseB2cResult` — disburse to a customer phone (Utility account — gotcha #7) — optional caller-generated `originatorConversationId` (B2C v3).
- `b2c.toPochi` — pay a customer's business wallet (pochi la biashara), `BusinessPayToPochi`.
- `b2b.pay` + `b2b.transferFloat` + `parseB2bResult` — pay another business, and move float Working↔Utility (funds B2C).
- `b2b.topUp` — B2C Account Top Up (`BusinessPayToBulk`): load a B2C shortcode's Utility account.
- `b2b.remitTax` — Tax Remittance to KRA (`PayTaxToKRA`).

**Standing orders & express:**

- `ratiba.create` + `parseRatibaCallback` — M-Pesa Ratiba: create a customer standing order (recurring collection).
- `express.checkout` + `parseExpressCallback` — B2B Express Checkout: USSD push to a merchant's till to pay a vendor paybill.

**Account management & reconciliation:**

- `status.stkPush` (sync) + `status.transaction` (async) + `parseStatusResult` — query a transaction's outcome — by receipt, or by OriginatorConversationID when no receipt exists; `parseStatusResult` exposes `transactionStatus` and `receipt`.
- `reversal.request` + `parseReversalResult` + `isSettledByRecipientSpend` — reverse a transaction; classify the "recipient already spent it" case (gotcha #16).
- `balance.query` + `parseBalanceResult` / `parseAccountBalance` — query account balances, with the pipe-delimited parser (gotcha #6).
- `pull.registerUrl` + `pull.query` — Pull Transaction API (Daraja 3.0) to backfill C2B payments missed when a callback failed (gotcha #10).
- `orgInfo.query` — validate a shortcode's name + tariff before paying (synchronous; reduces reversals to the wrong till/paybill).
- `qr.generate` — dynamic QR codes (Pay Bill / Buy Goods / Send Money / etc.).

**Invoicing:**

- `billManager.optIn` / `updateOptIn` / `sendInvoice` / `sendBulkInvoices` / `cancelInvoice` / `cancelBulkInvoices` / `acknowledgePayment` + `parseBillManagerPayment` + `billManagerAck` — Bill Manager invoicing & reconciliation.

**Cross-cutting:**

- `generateSecurityCredential` — RSA-encrypt the initiator password for the initiator-authed APIs.
- `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible signing + verification (sync + edge).
- The phone / amount / timestamp / password primitives (`normalizePhone`, `phoneToNumber`, `makeTimestamp`, `generatePassword`, `validateAmount`).
- The `DarajaError` hierarchy + `errorFromResult` / `errorFromResponse` + a **proven result-code catalog** that turns Safaricom's codes into actionable messages — see [ERROR_CODES.md](./docs/ERROR_CODES.md).
- OAuth token management (race-safe, 3599s TTL) and the HTTP transport.
- Pluggable cross-process token cache (`tokenStore`) — share one OAuth token across workers (e.g. Redis), no SDK Redis dependency.

This covers **100% of Safaricom's money APIs** — collection, disbursement, standing orders, account management, reconciliation, invoicing, and QR. (Out of scope by design: the sandbox-only C2B simulate endpoint and the non-money telco APIs.) The commercial/add-on products (Bill Manager, Ratiba, B2B Express, Query Org Info, Lipa na Bonga) require enabling on your Daraja app — and some a Go-Live — before live calls succeed.

Full surface in the [API reference](https://kepas-tech.github.io/daraja-js/) (auto-published from each commit to `main`).

## TypeScript

Types are bundled — no `@types/daraja-js` needed. Inputs and Daraja callbacks are fully typed; the error hierarchy (`DarajaError` → `DarajaAuthError`, `DarajaInsufficientFundsError`, …) lets you branch on recoverable vs fatal.

## Proven meaningful errors

Safaricom returns short codes (`1037`, `SFC_IC0003`, …) and **does not publish a full list**. daraja-js ships a catalog where every meaning comes from a real source: a production response we saw, our own code, or Safaricom's official docs. Parsed results carry the extras:

```ts
const r = parseStkCallback(req.body);
if (!r.success) {
  console.log(r.resultCode);  // 1037
  console.log(r.resultDesc);  // Safaricom's exact text (unchanged)
  console.log(r.meaning);     // "The customer didn't respond to the STK prompt within ~60s…"
  console.log(r.retriable);   // true
  console.log(r.catalogued);  // true; if false, the code isn't catalogued and we pass Safaricom's text through unchanged
}
```

A code we can't back with a source is passed through **as-is** (`catalogued: false`) — we never make up a meaning. Full table and sources: [docs/ERROR_CODES.md](./docs/ERROR_CODES.md).

## Security

Webhook signatures use the Stripe-compatible scheme (`t=…,v1=…`, HMAC-SHA256 over the raw body, constant-time compare, replay window). Report vulnerabilities through [SECURITY.md](./SECURITY.md), **not** public issues. We do not ship any Safaricom certificate (they own those); `generateSecurityCredential()` works with your own.

Three things you own when integrating:

- **Verify the raw body.** Pass the exact request bytes to `webhooks.constructEvent(Async)` — not `JSON.stringify(req.body)`, which re-serializes and breaks the signature.
- **Make callback handlers idempotent.** The SDK verifies signatures but keeps no replay cache; dedupe on the transaction/receipt id so a re-delivered (or replayed-within-window) callback isn't processed twice.
- **Don't blindly log errors.** `DarajaError.raw` (the Daraja response, which may contain MSISDN/receipts) is non-enumerable, so `JSON.stringify`/`console.log`/most logger serializers skip it — but if you explicitly read `err.raw`, scrub PII before logging it.

## Telemetry

Off by default. The SDK makes no network calls except to Safaricom.

## Support this project 💛

`daraja-js` is free and Apache 2.0. If it saved you an outage, you can fund its
maintenance via M-Pesa — the same rail this SDK is built on:

> **Pay Bill → Business no. `4052037` → Account no. `daraja` → amount → PIN.**

Donations are voluntary and buy no support guarantees or roadmap influence.
International card rails and full details in [DONATING.md](./DONATING.md).

## Community

- [Discussions](https://github.com/kepas-tech/daraja-js/discussions) — questions, ideas, RFCs
- [Issues](https://github.com/kepas-tech/daraja-js/issues) — bugs + features
- [CONTRIBUTING.md](./CONTRIBUTING.md) — DCO sign-off required (`git commit -s`)

## License

[Apache License 2.0](./LICENSE). Patent grant included.

## About KEPAS

KEPAS (Kenya Professionals in Application Solutions), also known as KEPAS Technologies, is a registered Kenyan software company (Business No. BN-KYCRJ5VG) in Loitokitok, Kajiado County, founded by Nelson Lemein. We build websites, mobile apps, and M-Pesa integrations for schools, hospitals, NGOs, and government offices; run KodiSap, WABI, and enabos; and maintain free tools and the open-source @kepas/daraja-js M-Pesa SDK. https://kepas.co.ke

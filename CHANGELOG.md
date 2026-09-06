# Changelog

## 1.5.0

### Minor Changes

- eca78c8: Transaction Status by OriginatorConversationID, B2C v3, and initiator-credential codes.
  
  - `status.transaction` accepts `originatorConversationId` in place of (or alongside) `transactionId`, so a transaction that never returned a receipt can still be queried. Neither id → `DarajaValidationError`. The receipt-only body is unchanged.
  - `parseStatusResult` lifts `transactionStatus` and `receipt` (from the `TransactionStatus` / `ReceiptNo` result parameters, key spelling tolerated) onto `StatusResult`; `params` is untouched.
  - `b2c.send` accepts `originatorConversationId`; when given the request goes to `/mpesa/b2c/v3/paymentrequest` with `OriginatorConversationID` in the body. Omitted → v1 exactly as before.
  - Catalog: `b2c` entries for `2001` (initiator information invalid) and `8006` (security credential locked), and a `b2b` entry for `2001`, proof `safaricom-docs` (`docs/specs/business-to-pochi.md`, `docs/specs/b2c-account-topup.md`, `docs/specs/tax-remittance.md`). `b2b` 8006 is not catalogued yet (no Safaricom document for a b2b endpoint lists it); the SDK passes Safaricom's `ResultDesc` through verbatim.
  - `status.transaction` now rejects blank or whitespace-only ids locally with `DarajaValidationError` (1.4.1 sent an empty `TransactionID` to Safaricom and surfaced the rejection as `DarajaAPIError`).
  - Type note: `TransactionStatusInput.transactionId` is now optional (`string | undefined`); callers that only read the type may need a narrowing.

## 1.4.1

### Patch Changes

- 4ea2ebf: Repository moved to the KEPAS Technologies organization: `github.com/kepas-tech/daraja-js`. Package metadata (`repository`, `homepage`, `bugs`), the API reference URL, and all community links now point at the new home. No runtime changes.

## 1.4.0

### Minor Changes

- f368fa2: Sync all documentation to v1.3.0 code reality and add the proven Lipa na Bonga result codes.

  - Add Bonga catalog entries to `CATALOG` (sync `200`; processing `6000`/`6001`/`6004`–`6009`/`6011`/`1037`/`1031`/`2001`/`17`, proof=safaricom-docs) so the declared `bonga` scope is no longer hollow.
  - `docs/ERROR_CODES.md` now renders all 13 scopes (was missing `billmanager`, `ratiba`, `b2bexpress`, `bonga`).
  - README "What's covered" lists every shipped namespace/method (the 8 v1.3.0 APIs were absent); the roadmap no longer advertises shipped features as "post-1.0". ROADMAP.md rewritten to reflect shipped reality.
  - CI now fails if `docs/ERROR_CODES.md` drifts from the catalog, and a unit test asserts every catalogued scope is rendered — making doc drift impossible to merge.

### Patch Changes

- 16bfea6: Add PREREQUISITES.md — a per-API guide to the exact Safaricom credentials, Daraja product enablement, operator roles, and Go-Live each capability requires (auth tiers grounded in the SDK's own guards; product/role facts from the official specs). Linked from the README and shipped in the npm tarball.

## 1.3.0

### Minor Changes

- 9eac3d6: Add B2B Express Checkout (`daraja.express.checkout`) — vendor-initiated USSD push to a merchant's till (`/v1/ussdpush/get-msisdn`). OAuth-only, camelCase body, `code`/`status` sync ack; auto-generates `RequestRefID` (UUID) when omitted. Adds `parseExpressCallback` for the FLAT async callback (top-level `resultCode`, no `Result{}` envelope). New `b2bexpress` catalog scope (`0`, `4104`, `4102` sync; `0`, `4001` async).
- 9eac3d6: Add `b2b.topUp` (B2C Account Top Up — `BusinessPayToBulk`, loads a B2C shortcode's Utility account; optional `requester`) and `b2b.remitTax` (Tax Remittance to KRA — `PayTaxToKRA`, PartyB fixed `572572`, `prn` sent as AccountReference, own `/mpesa/b2b/v1/remittax` endpoint). Both reuse the b2b initiator guard, ack, and `parseB2bResult`. Verified live against production: `topUp` rejected an invalid PartyB synchronously; `remitTax` accepted (ResponseCode 0).
- 9eac3d6: Add Bill Manager support (`daraja.billManager`): `optIn`, `updateOptIn`, `sendInvoice`, `sendBulkInvoices` (≤1000), `cancelInvoice`, `cancelBulkInvoices`, `acknowledgePayment`, plus `parseBillManagerPayment` (inbound payment push) and `billManagerAck`. Bill Manager uses its own success convention (string `rescode "200"`, not `ResponseCode "0"`) and an `app_key` header obtained from `optIn` (pass per-call as `appKey` or set `config.billManagerAppKey`). `http.post` now accepts an additive `headers` option; fixed auth/content-type headers always win the merge. New `billmanager` catalog scope (`200`/`409`).
- 9eac3d6: Add Lipa na Bonga (`daraja.bonga`): `calculatePoints` (read-only points→KES conversion, retryable) and `redeem` (redeem Bonga points as payment to a paybill/till). OAuth-only, nested `header`/`body` envelope, success is `header.responseCode 200`. The redemption result settles on the existing C2B confirmation callback (`parseC2bConfirmation`) — no Bonga-specific result parser. New `bonga` catalog scope.
- 9eac3d6: Add Query Organization Info (`daraja.orgInfo.query`) — synchronous, read-only shortcode validation (`/sfcverify/v1/query/info`) returning org name, tariff (ChargeProfileID), and a `success` flag. OAuth-only, idempotent (retryable). `identifierType` maps `paybill`→4 / `till`→2. Success is gated on `ResponseMessage === "Success"` + an OrganizationName (the spec's numeric success code is contradictory — `4000` vs `0` — so the raw code is exposed verbatim, not asserted).
- 9eac3d6: Add Business To Pochi (`daraja.b2c.toPochi`) — pay a customer's business wallet (pochi la biashara) via `/mpesa/b2pochi/v1/paymentrequest` + `BusinessPayToPochi`. Reuses B2C auth, the `ResponseCode "0"` ack, and `parseB2cResult`. Caller-supplied `originatorConversationId` (dedupe guard, auto-generated UUID if omitted) and optional `occasion` (sent as Safaricom's misspelled `Occassion`).
- 9eac3d6: Add M-Pesa Ratiba support (`daraja.ratiba.create`) — create a customer standing order (recurring collection) via `/standingorder/v1/createStandingOrderExternal`. OAuth-only; success is the nested `ResponseHeader.responseCode "200"`. Adds `parseRatibaCallback` for the async result (nested `responseBody.responseData[]` `name`/`value` pairs, parsed case-insensitively), `RatibaFrequency` (1–8), and `paybill`/`buygoods` transaction-type mapping (the latter sends Safaricom's misspelled `Standing Order Customer Pay Marchant`). New `ratiba` catalog scope (`200`, `0`, `1037`, `1032`, `2001`, `1050`, `1051`).

## 1.2.0

### Minor Changes

- Fix findings from the post-1.1.1 expert review.

  - **Parser crash on single-param callbacks (bug, observed in production):** Daraja
    collapses a one-element `ResultParameters.ResultParameter` (and STK
    `CallbackMetadata.Item`) to a bare object, not an array — the parsers did
    `for…of` over it and threw `TypeError`. All six parsers now normalize via a
    `toArray` helper. (`?? []` did not cover this — a non-null object passed through.)
  - **No 5xx-retry on non-idempotent payment POSTs:** `http.post` gains a `retryable`
    flag, default **false** (payment-safe). STK/B2C/B2B/reversal never retry on 5xx
    (no duplicate disbursement); reads/registrations (balance, status, c2b register,
    qr, pull) opt in. Timeouts were already never retried.
  - **Drop unused `valibot` runtime dependency** (zero imports) — `dependencies` is now empty.
  - **Webhook timestamp guard:** reject empty/zero/negative `t=` even when the replay
    window is disabled (`toleranceSec: 0`).
  - **CJS types:** `exports` now resolves `dist/index.d.cts` for `require` consumers.
  - **Docs:** reconciled README/SECURITY to stable 1.x (dropped "alpha/pre-1.0");
    unexported internal `HttpClientOptions`.

## 1.1.1

### Patch Changes

- Rename catalog proof-source tags to neutral `production-observed` / `production-code`
  (was `kepas-db` / `kepas-prod`). They were arbitrary provenance categories — not a
  real database or container name — but the neutral labels avoid resembling any
  infrastructure name in the published package. No behavior change.

## 1.1.0

### Minor Changes

- Add a proven Daraja result-code catalog and meaningful, actionable error messages.

  Every code's meaning is grounded in evidence — real Safaricom responses observed
  in production (the meaning IS Safaricom's own ResultDesc text), this SDK's code,
  kepas-pay's production handlers, or official docs. Community blogs are not a
  source, and codes we cannot prove are passed through VERBATIM (never fabricated).

  - New `result-codes` module: `CATALOG`, `lookup`, `classify`, `applyClassification`
    (per-API scoped — the same numeric code can differ by endpoint).
  - Async parsers (`parseStkCallback`, `parseB2cResult`, `parseStatusResult`,
    `parseReversalResult`, `parseBalanceResult`, `parseB2bResult`) now carry optional
    additive `meaning` / `retriable` / `terminal` / `catalogued` fields. `resultCode`/
    `resultDesc`/`success`/`raw` are unchanged. `parseReversalResult` adds
    `settledByRecipientSpend`.
  - `errorFromResult` is catalog-backed (default scope `stk` for back-compat); new
    `errorFromResponse` enriches synchronous rejections. No new error classes.
  - New `docs/ERROR_CODES.md` (generated) lists every catalogued code, its meaning,
    retriable/terminal, mapped SDK error, and proof source.

  Fully backward-compatible: additive fields/exports only.

## 1.0.0

First stable release. The SDK covers **every Daraja endpoint** a production
PayBill uses — STK Push, C2B, B2C, B2B + float transfers, balance, transaction
status, reversal, dynamic QR, and Pull Transactions — plus the security-credential
helper, Stripe-compatible webhook signing/verification, a pluggable cross-process
token cache, and an auto-published API reference. 130 tests; passed an
independent pre-1.0 security review.

### Major Changes

- **Stable public API.** The `Daraja` client surface and exports are now under
  semver — breaking changes will bump the major version.

### Patch Changes

- Security hardening from the pre-1.0 review: `DarajaError.raw` is now
  non-enumerable with a raw-free `toJSON()`, so Daraja response payloads (which
  may contain customer PII) are not dumped into logs by `JSON.stringify` /
  `console.log` / error serializers. `err.raw` remains accessible for explicit
  debugging.

## 0.8.0

### Minor Changes

- Add a pluggable cross-process OAuth token cache (`tokenStore`).

  Pass `tokenStore` on the client config to share one token across workers (e.g.
  Redis) instead of one-per-process. It's a minimal two-method contract
  (`get`/`set`) over any backend — the SDK keeps zero Redis dependency. The
  in-memory fast path is preserved (the store is read only on a cold local token),
  and keys are namespaced per environment + consumer key (gotcha #12). This is the
  prerequisite for running kepas-pay 100% on the SDK at multi-worker scale.

## 0.7.0

### Minor Changes

- Add QR and Pull Transactions — completing 100% parity with kepas-pay's Daraja
  surface.

  - `daraja.qr.generate({ accountReference, amount?, trxCode?, size? })` — dynamic
    QR (success is ResponseCode "00"; TrxCode BG/WA/PB/SM/SB).
  - `daraja.pull.registerUrl({ nominatedNumber, callbackUrl })` and
    `daraja.pull.query({ startDate, endDate, offset? })` — Pull Transaction API
    (Daraja 3.0) to backfill C2B payments missed when a callback failed. Handles
    the gotcha-#10 quirks: no `/mpesa/` prefix, NominatedNumber as MSISDN,
    OffSetValue as a number.

## 0.6.0

### Minor Changes

- Add transaction status queries and reversal.

  - `daraja.status.stkPush({ checkoutRequestId })` — synchronous STK Push status
    query (returns the outcome inline; passkey auth).
  - `daraja.status.transaction({ transactionId, resultUrl, queueTimeoutUrl })` —
    async transaction status query (initiator-authed). `parseStatusResult` for the
    callback.
  - `daraja.reversal.request({ transactionId, amount, resultUrl, queueTimeoutUrl })`
    — reverse a transaction (initiator-authed). `parseReversalResult` for the
    callback.
  - `isSettledByRecipientSpend(resultDesc)` — conservative classifier for the
    "recipient already spent the funds" reversal failure (gotcha #16, no stable
    ResultCode).

## 0.5.0

### Minor Changes

- Add B2B — pay another business + float transfers.

  - `daraja.b2b.pay({ toShortcode, amount, commandId?, accountReference?, ... })`
    — pay another PayBill (`BusinessPayBill`) or Till (`BusinessBuyGoods`, receiver
    identifier 2). Numeric parties, initiator-authed.
  - `daraja.b2b.transferFloat({ amount, direction })` — move money Working(MMF)↔
    Utility on your own shortcode (`BusinessTransferFromMMFToUtility` /
    `...UtilityToMMF`). This is how you fund B2C (gotcha #7).
  - `parseB2bResult` — parse the async result callback.

  Sends Daraja's misspelled `RecieverIdentifierType` exactly as the API expects.

## 0.4.0

### Minor Changes

- Add Account Balance (read-only).

  - `daraja.balance.query({ resultUrl, queueTimeoutUrl, remarks? })` — POST
    /mpesa/accountbalance/v1/query with the AccountBalance command; returns the
    async ack. Requires initiator auth.
  - `parseBalanceResult` — parse the async result envelope.
  - `parseAccountBalance` — the standalone pipe-delimited parser (gotcha #6):
    `Account|Currency|Current|Available|Reserved|Uncleared`, accounts joined by `&`.

## 0.3.0

### Minor Changes

- Add B2C (money out) and the SecurityCredential helper that unlocks the
  initiator-authed APIs.

  - `generateSecurityCredential({ password, certPem | certPath })` — RSA-encrypt
    the initiator password (PKCS1 v1.5) + base64, exactly what B2C/B2B/balance/
    status/reversal expect. Node-only offline helper; ships no certificate.
  - `daraja.b2c.send({ phone, amount, resultUrl, queueTimeoutUrl, commandId?, remarks?, occasion? })`
    — POST /mpesa/b2c/v1/paymentrequest with numeric PartyA/PartyB; returns the
    async ack. Draws from the Utility account (gotcha #7). Requires `initiator` +
    `securityCredential` on the client config.
  - `parseB2cResult` — parse the async result callback (receipt, amount, recipient,
    Utility/Working balances).

## 0.2.0

### Minor Changes

- Add C2B support — capture payments customers make directly to your PayBill/Till.

  - `daraja.c2b.registerUrls({ confirmationUrl, validationUrl, responseType? })` —
    register validation + confirmation callback URLs (`/mpesa/c2b/v2/registerurl`).
  - `parseC2bConfirmation` — parse the confirmation callback into a typed payment
    with `amount` as a number and `terminal: true` (gotcha #8 — money is already
    settled, no second callback, and Safaricom does not retry it).
  - `parseC2bValidation` — parse the pre-payment validation callback.
  - `c2bAccept()` / `c2bReject(reason?, code?)` — the response bodies Safaricom
    expects to accept or reject a validation request.

## 0.1.1

### Patch Changes

- Fix `VERSION` reporting `0.0.0` — it's now injected from package.json at build
  time (was a stale literal). Add a gated live STK Push integration test
  (`pnpm test:integration`, sandbox-only, skipped without creds).

## 0.1.0

### Minor Changes

- c85be80: Add `TokenManager`: OAuth token cache with a 3599s TTL, configurable safety
  margin, single-flight refresh (concurrent callers share one request), and no
  caching of failed fetches.
- a739473: Add the foundation layer: validation primitives and the error hierarchy.

  - `normalizePhone` / `phoneToNumber` — accept all five Kenyan phone formats and a hashed MSISDN, cast to a JS number for STK Push (gotchas #1, #2).
  - `makeTimestamp` — `YYYYMMDDHHMMSS` UTC (gotcha #3).
  - `generatePassword` — `base64(shortcode + passkey + timestamp)` (gotcha #4).
  - `validateAmount` — whole-KES guard.
  - `DarajaError` hierarchy with `errorFromResult`, mapping ResultCodes 1 (insufficient funds), 1032 (cancelled), and 1037 (user unreachable) to typed errors.

- 5daf191: Add the `Daraja` client and `collect.stkPush` — the first end-to-end call.

  - `Daraja` validates config, resolves the sandbox/production base URL, and wires
    the race-safe token manager + HTTP transport.
  - `collect.stkPush` composes the primitives so `PartyA`/`PhoneNumber` ship as JSON
    numbers (gotcha #1), the timestamp is UTC, and the password is correctly
    derived. Returns a normalized `StkPushResult`; throws `DarajaAPIError` on a
    non-zero `ResponseCode`.
  - HTTP layer retries only on 5xx (never timeouts) to avoid double-charging a
    payment POST.
  - Validation primitives now throw `DarajaValidationError` so bad input surfaces
    uniformly before any network call.

- dede37e: Add webhook handling — STK Push is now fully receivable.

  - `parseStkCallback` — parse the async STK result Safaricom posts to your
    callback URL into a typed `StkCallbackResult` (success flag + receipt, amount,
    phone, date from `CallbackMetadata`). Accepts a parsed object or raw JSON.
  - `webhooks.sign` / `constructEvent` / `constructEventAsync` — Stripe-compatible
    HMAC-SHA256 signing and verification (`t=…,v1=…` over `timestamp.payload`,
    constant-time compare, replay window). Sync uses `node:crypto`; the async
    variant uses WebCrypto for edge runtimes. For platforms re-emitting events.
  - New `DarajaSignatureError`.

  First public release, published as `@kepas/daraja-js`: STK Push end-to-end
  (send, receive, verify) plus the validation/error/auth/HTTP core.

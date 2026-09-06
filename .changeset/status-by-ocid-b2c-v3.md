---
"@kepas/daraja-js": minor
---

Transaction Status by OriginatorConversationID, B2C v3, and initiator-credential codes.

- `status.transaction` accepts `originatorConversationId` in place of (or alongside) `transactionId`, so a transaction that never returned a receipt can still be queried. Neither id → `DarajaValidationError`. The receipt-only body is unchanged.
- `parseStatusResult` lifts `transactionStatus` and `receipt` (from the `TransactionStatus` / `ReceiptNo` result parameters, key spelling tolerated) onto `StatusResult`; `params` is untouched.
- `b2c.send` accepts `originatorConversationId`; when given the request goes to `/mpesa/b2c/v3/paymentrequest` with `OriginatorConversationID` in the body. Omitted → v1 exactly as before.
- Catalog: `b2c` entries for `2001` (initiator information invalid) and `8006` (security credential locked), and a `b2b` entry for `2001`, proof `safaricom-docs` (`docs/specs/business-to-pochi.md`, `docs/specs/b2c-account-topup.md`, `docs/specs/tax-remittance.md`). `b2b` 8006 is not catalogued yet (no Safaricom document for a b2b endpoint lists it); the SDK passes Safaricom's `ResultDesc` through verbatim.
- `status.transaction` now rejects blank or whitespace-only ids locally with `DarajaValidationError` (1.4.1 sent an empty `TransactionID` to Safaricom and surfaced the rejection as `DarajaAPIError`).
- Type note: `TransactionStatusInput.transactionId` is now optional (`string | undefined`); callers that only read the type may need a narrowing.

# Daraja result/response codes — proven catalog

> **How to read this.** Every code below is **proven** from one of: real Safaricom
> responses observed in production (`production-observed` — the meaning IS
> Safaricom's own `ResultDesc` text), this SDK's own code (`sdk-code`), a
> production integration's handlers (`production-code`), or official Safaricom
> docs (`safaricom-docs`). Community blogs are **not** a source.
>
> **This is not exhaustive — and cannot be.** Safaricom does not publish a complete
> error-code reference; codes arrive inline with each response. Any code NOT listed
> here is passed through by the SDK **verbatim** (Safaricom's `ResultDesc`, generic
> `DarajaAPIError`) with no fabricated meaning. The list grows as new codes are
> observed (re-run `tools/mine-daraja-codes.sql`).
>
> **Where these surface:** async `resultCode`s arrive on the parsers
> (`parseStkCallback`, `parseB2cResult`, …) as `{ resultCode, resultDesc, meaning?,
> retriable?, terminal?, catalogued? }`; `errorFromResult({ scope, resultCode })`
> turns one into a typed error; sync rejections throw via `errorFromResponse`.

## STK Push (`stk`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Payment received. | no | yes | — | production-observed |
| `1` | resultCode | — | The customer has insufficient M-Pesa balance (and no Fuliza). Ask them to top up and retry. | yes | no | DarajaInsufficientFundsError | production-code, sdk-code |
| `1032` | resultCode | — | The customer dismissed the STK prompt. | yes | no | DarajaCancelledError | production-observed |
| `1037` | resultCode | — | The customer didn't respond to the STK prompt within ~60s — phone off, out of network, or prompt ignored. Ask them to retry. | yes | no | DarajaUserUnreachableError | production-observed |

## C2B (`c2b`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | c2bReply | ✅ | Accept the payment. | no | yes | — | sdk-code |
| `C2B00011` | c2bReply | — | Reject: invalid MSISDN. | no | no | DarajaAPIError | sdk-code |
| `C2B00012` | c2bReply | — | Reject: invalid account number. | no | no | DarajaAPIError | sdk-code |
| `C2B00013` | c2bReply | — | Reject: invalid amount. | no | no | DarajaAPIError | sdk-code |
| `C2B00016` | c2bReply | — | Reject: other. | no | no | DarajaAPIError | sdk-code |

## B2C (`b2c`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Payout completed. | no | yes | — | production-observed |
| `1` | resultCode | — | Your Utility (B2C) account has insufficient funds. Top it up (B2B transfer Working→Utility) and retry. | yes | no | DarajaInsufficientFundsError | production-observed |
| `2` | resultCode | — | Amount is below M-Pesa’s minimum for this payout. Increase the amount. | no | no | DarajaAPIError | production-observed |
| `2001` | resultCode | — | Safaricom rejected the API operator credential (wrong operator password or Security Credential). Re-enter the operator password in the Safaricom portal, then set the new credential. | no | yes | DarajaAPIError | safaricom-docs |
| `8006` | resultCode | — | The API operator's Security Credential is locked. Reset the operator password in the Safaricom portal (Organization Operator › Reset Password), then set the new credential. | no | yes | DarajaAPIError | safaricom-docs |

## B2B + float transfers (`b2b`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Transfer completed. | no | yes | — | production-observed |
| `1` | resultCode | — | The sending (Working) account has insufficient funds. Fund it and retry. | yes | no | DarajaInsufficientFundsError | production-observed |
| `21` | resultCode | — | The initiator is not permitted to perform this B2B/float operation. Check the initiator name + its role/permissions on the M-Pesa org portal. | no | no | DarajaAPIError | production-observed |
| `SFC_IC0003` | resultCode | — | The receiver is invalid — wrong destination shortcode, or wrong ReceiverIdentifierType for the CommandID (PayBill=4, BuyGoods=2). | no | no | DarajaAPIError | production-observed |
| `2001` | resultCode | — | Safaricom rejected the API operator credential (wrong operator password or Security Credential). Re-enter the operator password in the Safaricom portal, then set the new credential. | no | yes | DarajaAPIError | safaricom-docs |

## Account Balance (`balance`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Balance query completed. | no | yes | — | production-observed |

## Transaction Status (`status`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Status query completed. | no | yes | — | production-observed |
| `25` | resultCode | — | Daraja rejected the status query — a required parameter was missing or malformed (commonly the transaction id or IdentifierType). Check the query inputs. | no | no | DarajaAPIError | production-observed |

## Reversal (`reversal`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | resultCode | ✅ | Reversal completed. | no | yes | — | production-observed |

## Dynamic QR (`qr`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `00` | responseCode | ✅ | QR generated. | no | yes | — | sdk-code |

## Pull Transactions (`pull`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `1000` | pullStatus | ✅ | Pull callback URL registered. | no | yes | — | sdk-code |
| `1001` | pullStatus | ✅ | Pull callback URL was already registered (no change needed). | no | yes | — | sdk-code |

## Bill Manager (`billmanager`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `200` | responseCode | ✅ | Bill Manager request accepted. | no | yes | — | sdk-code |
| `409` | responseCode | — | Bill Manager rejected the request as a conflict — e.g. biller already registered, duplicate externalReference, or a partially/fully paid invoice cannot be cancelled. See the response message. | no | no | DarajaAPIError | safaricom-docs |

## M-Pesa Ratiba (standing orders) (`ratiba`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `200` | responseCode | ✅ | Standing order request accepted — a PIN prompt was sent to the customer. | no | yes | — | sdk-code |
| `0` | resultCode | ✅ | Standing order created. | no | yes | — | safaricom-docs |
| `1037` | resultCode | — | The customer didn't receive or respond to the PIN prompt (phone off/out of network, or no STK applet). Ask them to retry. | yes | no | DarajaUserUnreachableError | safaricom-docs |
| `1032` | resultCode | — | The customer cancelled the PIN prompt (or it timed out). | yes | no | DarajaCancelledError | safaricom-docs |
| `2001` | resultCode | — | The customer entered the wrong M-Pesa PIN. Ask them to retry with the correct PIN. | yes | no | DarajaAPIError | safaricom-docs |
| `1050` | resultCode | — | The customer already has a standing order with this name. Use a unique StandingOrderName. | no | no | DarajaAPIError | safaricom-docs |
| `1051` | resultCode | — | A field in the standing-order request is invalid. Check the request payload. | no | no | DarajaAPIError | safaricom-docs |

## B2B Express Checkout (`b2bexpress`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `0` | responseCode | ✅ | USSD push initiated — the merchant was prompted to enter their PIN. | no | no | — | sdk-code |
| `4104` | responseCode | — | The shortcode has no Nominated Number (the operator's preferred MSISDN) set on the M-Pesa portal — the push can't be sent. Set it under Organization Details. | no | no | DarajaAPIError | safaricom-docs |
| `4102` | responseCode | — | The merchant failed KYC. Provide valid KYC. | no | no | DarajaAPIError | safaricom-docs |
| `0` | resultCode | ✅ | Payment completed. | no | yes | — | safaricom-docs |
| `4001` | resultCode | — | The merchant cancelled the USSD prompt (or it timed out). | yes | no | DarajaCancelledError | safaricom-docs |

## Lipa na Bonga (`bonga`)

| Code | Kind | Success | Meaning | Retriable | Terminal | SDK error | Proof |
|------|------|---------|---------|-----------|----------|-----------|-------|
| `200` | responseCode | ✅ | Bonga request accepted (points→KES conversion, or redemption initiated). | no | no | — | sdk-code |
| `6000` | resultCode | ✅ | Bonga redemption processed successfully. | no | yes | — | safaricom-docs |
| `6001` | resultCode | — | Fail. | no | no | DarajaAPIError | safaricom-docs |
| `6004` | resultCode | — | Server error. | yes | no | DarajaAPIError | safaricom-docs |
| `6005` | resultCode | — | Invalid credentials passed. | no | no | DarajaAPIError | safaricom-docs |
| `6006` | resultCode | — | Missing parts in the request body. | no | no | DarajaAPIError | safaricom-docs |
| `6007` | resultCode | — | CBS unavailable / system busy. | yes | no | DarajaAPIError | safaricom-docs |
| `6008` | resultCode | — | STK unavailable / system busy. | yes | no | DarajaAPIError | safaricom-docs |
| `6009` | resultCode | — | Broker unavailable / system busy. | yes | no | DarajaAPIError | safaricom-docs |
| `6011` | resultCode | — | Database unavailable. | yes | no | DarajaAPIError | safaricom-docs |
| `1037` | resultCode | — | The PIN prompt didn't reach the customer (no STK applet / phone unreachable). Ask them to update their SIM and retry. | yes | no | DarajaUserUnreachableError | safaricom-docs |
| `1031` | resultCode | — | STK push timeout — the customer did not enter the PIN in time. | yes | no | DarajaAPIError | safaricom-docs |
| `2001` | resultCode | — | Wrong PIN entered / initiator information invalid. | yes | no | DarajaAPIError | safaricom-docs |
| `17` | resultCode | — | Reversal fails due to account balance limit (KES 100,000). | no | no | DarajaAPIError | safaricom-docs |

## Codes we deliberately do NOT assert

Safaricom returns these (or they're widely cited) but we have **not** observed them
in our own traffic and they're not in our code, so the SDK does **not** invent a
meaning — it passes Safaricom's `ResultDesc` through verbatim:

- **STK**: 17, 26, 1001, 1019, 1025, 2001, 9999 (and any other unlisted code).
- **Dotted HTTP errorCodes** (e.g. `500.001.1001`, `400.002.02`): never observed in our logged responses — not asserted.

When you hit one, `catalogued` is `false` and `resultDesc` is Safaricom's exact text.
If you can prove a new code (a real response), add it to `src/result-codes.ts` with a proof tag.

/**
 * Proven Daraja result/response-code catalog.
 *
 * Every entry's meaning is grounded in EVIDENCE, never assumption:
 * - `production-observed` — seen in real Safaricom responses in production
 *                           (the meaning IS Safaricom's own ResultDesc text).
 * - `production-code`     — handled in a production integration's code.
 * - `sdk-code`            — checked by this SDK's own resource code.
 * - `safaricom-docs`      — official Safaricom documentation.
 *
 * Community blogs / other SDKs are NOT a proof source. Codes we cannot prove
 * are deliberately ABSENT here — the SDK passes Safaricom's `ResultDesc` through
 * verbatim for them (never a fabricated message). Scope is per-API: the same
 * numeric code may mean different things on different endpoints, so we only
 * assert what is proven for that specific scope.
 */

export type DarajaScope =
  | 'stk'
  | 'b2c'
  | 'b2b'
  | 'reversal'
  | 'status'
  | 'balance'
  | 'c2b'
  | 'qr'
  | 'pull'
  | 'billmanager'
  | 'ratiba'
  | 'b2bexpress'
  | 'bonga';

export type CodeType = 'responseCode' | 'resultCode' | 'c2bReply' | 'pullStatus';

/** Only the error classes that already exist (v1) — no new ones invented. */
export type DarajaErrorClassName =
  | 'DarajaAPIError'
  | 'DarajaInsufficientFundsError'
  | 'DarajaCancelledError'
  | 'DarajaUserUnreachableError';

export interface ProofRef {
  kind: 'production-observed' | 'production-code' | 'sdk-code' | 'safaricom-docs';
  ref: string;
}

export interface CatalogEntry {
  scope: DarajaScope;
  codeType: CodeType;
  /** Always a string ('0', '00', '1037', 'SFC_IC0003', 'C2B00012', '1000'). */
  code: string;
  success: boolean;
  /** Short factual meaning. */
  canonicalMeaning: string;
  /** Actionable, human message. Present only when proven. */
  authoredMessage?: string;
  retriable: boolean;
  terminal: boolean;
  errorClass?: DarajaErrorClassName | undefined;
  proof: ProofRef[];
}

export interface Classification {
  catalogued: boolean;
  meaning?: string | undefined;
  retriable?: boolean | undefined;
  terminal?: boolean | undefined;
  errorClass?: DarajaErrorClassName | undefined;
}

/**
 * Optional, additive fields parsers layer onto a result when the code is
 * catalogued. `resultCode`/`resultDesc`/`success` are never replaced — these
 * only ADD a human meaning + retry/terminal hints.
 */
export interface CodeClassificationFields {
  /** Catalogued, actionable meaning (or Safaricom's text); undefined if unproven. */
  meaning?: string | undefined;
  retriable?: boolean | undefined;
  terminal?: boolean | undefined;
  /** True when the (scope, resultCode) pair is in the proven catalog. */
  catalogued?: boolean | undefined;
}

/** Apply a classification's additive fields onto a result object (mutates + returns it). */
export function applyClassification<T extends CodeClassificationFields>(
  target: T,
  scope: DarajaScope,
  resultCode: number | string,
  resultDesc?: string,
): T {
  const c = classify(scope, resultCode, resultDesc);
  target.catalogued = c.catalogued;
  if (c.meaning !== undefined) target.meaning = c.meaning;
  if (c.retriable !== undefined) target.retriable = c.retriable;
  if (c.terminal !== undefined) target.terminal = c.terminal;
  return target;
}

// Provenance helpers. `db`/`prod` deliberately carry NO internal detail (no
// table names, counts, or dates) — the category alone is the proof signal;
// publishing production volumes/schema in an OSS package is needless disclosure.
// `code` references this SDK's own public source, which is fine to cite.
const db = (_internalRef?: string): ProofRef => ({
  kind: 'production-observed',
  ref: 'seen in real Safaricom production responses',
});
const prod = (_internalRef?: string): ProofRef => ({
  kind: 'production-code',
  ref: 'handled in a production integration',
});
const code = (ref: string): ProofRef => ({ kind: 'sdk-code', ref });

export const CATALOG: readonly CatalogEntry[] = [
  // ── STK Push (async ResultCode) ──────────────────────────────────────────
  {
    scope: 'stk',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Payment received.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },
  {
    scope: 'stk',
    codeType: 'resultCode',
    code: '1',
    success: false,
    canonicalMeaning: 'Insufficient funds.',
    authoredMessage:
      'The customer has insufficient M-Pesa balance (and no Fuliza). Ask them to top up and retry.',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaInsufficientFundsError',
    proof: [prod(), code('errors.ts RESULT_CODE_MAP')],
  },
  {
    scope: 'stk',
    codeType: 'resultCode',
    code: '1032',
    success: false,
    canonicalMeaning: 'Request Cancelled by user.',
    authoredMessage: 'The customer dismissed the STK prompt.',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaCancelledError',
    proof: [db()],
  },
  {
    scope: 'stk',
    codeType: 'resultCode',
    code: '1037',
    success: false,
    canonicalMeaning: 'DS timeout user cannot be reached.',
    authoredMessage:
      "The customer didn't respond to the STK prompt within ~60s — phone off, out of network, or prompt ignored. Ask them to retry.",
    retriable: true,
    terminal: false,
    errorClass: 'DarajaUserUnreachableError',
    proof: [db()],
  },

  // ── B2C (async ResultCode) ───────────────────────────────────────────────
  {
    scope: 'b2c',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Payout completed.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },
  {
    scope: 'b2c',
    codeType: 'resultCode',
    code: '1',
    success: false,
    canonicalMeaning: 'The balance is insufficient for the transaction.',
    authoredMessage:
      'Your Utility (B2C) account has insufficient funds. Top it up (B2B transfer Working→Utility) and retry.',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaInsufficientFundsError',
    proof: [db()],
  },
  {
    scope: 'b2c',
    codeType: 'resultCode',
    code: '2',
    success: false,
    canonicalMeaning: 'Declined due to limit rule: less than the minimum transaction amount.',
    authoredMessage: 'Amount is below M-Pesa’s minimum for this payout. Increase the amount.',
    retriable: false,
    terminal: false,
    proof: [db()],
  },
  {
    scope: 'b2c',
    codeType: 'resultCode',
    code: '2001',
    success: false,
    canonicalMeaning: 'The initiator information is invalid.',
    authoredMessage:
      'Safaricom rejected the API operator credential (wrong operator password or Security Credential). Re-enter the operator password in the Safaricom portal, then set the new credential.',
    retriable: false,
    terminal: true,
    proof: [
      {
        kind: 'safaricom-docs',
        ref: 'docs/specs/business-to-pochi.md async failure (ResultCode 2001)',
      },
    ],
  },
  {
    scope: 'b2c',
    codeType: 'resultCode',
    code: '8006',
    success: false,
    canonicalMeaning: 'Security credential locked.',
    authoredMessage:
      "The API operator's Security Credential is locked. Reset the operator password on the M-Pesa org portal, then set the new credential.",
    retriable: false,
    terminal: true,
    proof: [
      {
        kind: 'safaricom-docs',
        ref: 'docs/specs/business-to-pochi.md result codes (8006 security credential locked)',
      },
    ],
  },

  // ── B2B + float transfers (async ResultCode, shared endpoint) ────────────
  {
    scope: 'b2b',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Transfer completed.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },
  {
    scope: 'b2b',
    codeType: 'resultCode',
    code: '1',
    success: false,
    canonicalMeaning: 'The balance is insufficient for the transaction.',
    authoredMessage: 'The sending (Working) account has insufficient funds. Fund it and retry.',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaInsufficientFundsError',
    proof: [db()],
  },
  {
    scope: 'b2b',
    codeType: 'resultCode',
    code: '21',
    success: false,
    canonicalMeaning: 'The initiator is not allowed to initiate this request.',
    authoredMessage:
      'The initiator is not permitted to perform this B2B/float operation. Check the initiator name + its role/permissions on the M-Pesa org portal.',
    retriable: false,
    terminal: false,
    proof: [db()],
  },
  {
    scope: 'b2b',
    codeType: 'resultCode',
    code: 'SFC_IC0003',
    success: false,
    canonicalMeaning: 'Receiver party is invalid',
    authoredMessage:
      'The receiver is invalid — wrong destination shortcode, or wrong ReceiverIdentifierType for the CommandID (PayBill=4, BuyGoods=2).',
    retriable: false,
    terminal: false,
    proof: [db()],
  },
  {
    scope: 'b2b',
    codeType: 'resultCode',
    code: '2001',
    success: false,
    canonicalMeaning: 'The initiator information is invalid.',
    authoredMessage:
      'Safaricom rejected the API operator credential (wrong operator password or Security Credential). Re-enter the operator password in the Safaricom portal, then set the new credential.',
    retriable: false,
    terminal: true,
    proof: [
      {
        kind: 'safaricom-docs',
        ref: 'docs/specs/b2c-account-topup.md failure (ResultCode 2001)',
      },
      {
        kind: 'safaricom-docs',
        ref: 'docs/specs/tax-remittance.md failure example (ResultCode 2001)',
      },
    ],
  },
  // b2b 8006 (security credential locked): add when a proof document for a b2b endpoint lists it.

  // ── Account Balance (async ResultCode) ───────────────────────────────────
  {
    scope: 'balance',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Balance query completed.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },

  // ── Transaction Status (async ResultCode) ────────────────────────────────
  {
    scope: 'status',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Status query completed.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },
  {
    scope: 'status',
    codeType: 'resultCode',
    code: '25',
    success: false,
    canonicalMeaning: 'The format of parameter null is invalid.',
    authoredMessage:
      'Daraja rejected the status query — a required parameter was missing or malformed (commonly the transaction id or IdentifierType). Check the query inputs.',
    retriable: false,
    terminal: false,
    proof: [db()],
  },

  // ── Reversal (async ResultCode) ──────────────────────────────────────────
  {
    scope: 'reversal',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Reversal completed.',
    retriable: false,
    terminal: true,
    proof: [db()],
  },

  // ── Synchronous success sentinels (proven by our resource code) ──────────
  {
    scope: 'qr',
    codeType: 'responseCode',
    code: '00',
    success: true,
    canonicalMeaning: 'QR Code Successfully Generated.',
    authoredMessage: 'QR generated.',
    retriable: false,
    terminal: true,
    proof: [code('qr.ts checks ResponseCode "00"')],
  },
  {
    scope: 'pull',
    codeType: 'pullStatus',
    code: '1000',
    success: true,
    canonicalMeaning: 'Pull URL registered.',
    authoredMessage: 'Pull callback URL registered.',
    retriable: false,
    terminal: true,
    proof: [code('pull.ts accepts 1000/1001')],
  },
  {
    scope: 'pull',
    codeType: 'pullStatus',
    code: '1001',
    success: true,
    canonicalMeaning: 'Shortcode already registered.',
    authoredMessage: 'Pull callback URL was already registered (no change needed).',
    retriable: false,
    terminal: true,
    proof: [code('pull.ts accepts 1000/1001')],
  },

  // ── Bill Manager (sync rescode — string, NOT ResponseCode "0") ───────────
  {
    scope: 'billmanager',
    codeType: 'responseCode',
    code: '200',
    success: true,
    canonicalMeaning: 'Success.',
    authoredMessage: 'Bill Manager request accepted.',
    retriable: false,
    terminal: true,
    proof: [code('bill-manager.ts checks rescode "200"')],
  },
  {
    scope: 'billmanager',
    codeType: 'responseCode',
    code: '409',
    success: false,
    canonicalMeaning: 'Conflict.',
    authoredMessage:
      'Bill Manager rejected the request as a conflict — e.g. biller already registered, duplicate externalReference, or a partially/fully paid invoice cannot be cancelled. See the response message.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Bill Manager 409 error family' }],
  },

  // ── M-Pesa Ratiba (standing order) ───────────────────────────────────────
  {
    scope: 'ratiba',
    codeType: 'responseCode',
    code: '200',
    success: true,
    canonicalMeaning: 'Request accepted for processing.',
    authoredMessage: 'Standing order request accepted — a PIN prompt was sent to the customer.',
    retriable: false,
    terminal: true,
    proof: [code('ratiba.ts checks ResponseHeader.responseCode "200"')],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Standing order created.',
    retriable: false,
    terminal: true,
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba callback success' }],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '1037',
    success: false,
    canonicalMeaning: 'DS timeout — user cannot be reached.',
    authoredMessage:
      "The customer didn't receive or respond to the PIN prompt (phone off/out of network, or no STK applet). Ask them to retry.",
    retriable: true,
    terminal: false,
    errorClass: 'DarajaUserUnreachableError',
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba error codes' }],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '1032',
    success: false,
    canonicalMeaning: 'Request cancelled by user.',
    authoredMessage: 'The customer cancelled the PIN prompt (or it timed out).',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaCancelledError',
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba error codes' }],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '2001',
    success: false,
    canonicalMeaning: 'The initiator information is invalid.',
    authoredMessage:
      'The customer entered the wrong M-Pesa PIN. Ask them to retry with the correct PIN.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba error codes' }],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '1050',
    success: false,
    canonicalMeaning: 'A standing order with the same name already exists on the profile.',
    authoredMessage:
      'The customer already has a standing order with this name. Use a unique StandingOrderName.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba error codes' }],
  },
  {
    scope: 'ratiba',
    codeType: 'resultCode',
    code: '1051',
    success: false,
    canonicalMeaning: 'Bad request — one or more fields in the payload is invalid.',
    authoredMessage: 'A field in the standing-order request is invalid. Check the request payload.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Ratiba error codes' }],
  },

  // ── B2B Express Checkout (USSD push) ─────────────────────────────────────
  {
    scope: 'b2bexpress',
    codeType: 'responseCode',
    code: '0',
    success: true,
    canonicalMeaning: 'USSD Initiated Successfully.',
    authoredMessage: 'USSD push initiated — the merchant was prompted to enter their PIN.',
    retriable: false,
    terminal: false,
    proof: [code('b2b-express.ts checks code "0"')],
  },
  {
    scope: 'b2bexpress',
    codeType: 'responseCode',
    code: '4104',
    success: false,
    canonicalMeaning: 'Missing Nominated Number.',
    authoredMessage:
      "The shortcode has no Nominated Number (the operator's preferred MSISDN) set on the M-Pesa portal — the push can't be sent. Set it under Organization Details.",
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'B2B Express error codes' }],
  },
  {
    scope: 'b2bexpress',
    codeType: 'responseCode',
    code: '4102',
    success: false,
    canonicalMeaning: 'Merchant KYC fail.',
    authoredMessage: 'The merchant failed KYC. Provide valid KYC.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'B2B Express error codes' }],
  },
  {
    scope: 'b2bexpress',
    codeType: 'resultCode',
    code: '0',
    success: true,
    canonicalMeaning: 'The service request is processed successfully.',
    authoredMessage: 'Payment completed.',
    retriable: false,
    terminal: true,
    proof: [{ kind: 'safaricom-docs', ref: 'B2B Express callback success' }],
  },
  {
    scope: 'b2bexpress',
    codeType: 'resultCode',
    code: '4001',
    success: false,
    canonicalMeaning: 'User cancelled transaction.',
    authoredMessage: 'The merchant cancelled the USSD prompt (or it timed out).',
    retriable: true,
    terminal: false,
    errorClass: 'DarajaCancelledError',
    proof: [{ kind: 'safaricom-docs', ref: 'B2B Express callback (cancelled)' }],
  },

  // ── Lipa na Bonga (sync header.responseCode 200; processing result codes) ─
  {
    scope: 'bonga',
    codeType: 'responseCode',
    code: '200',
    success: true,
    canonicalMeaning: 'Success.',
    authoredMessage: 'Bonga request accepted (points→KES conversion, or redemption initiated).',
    retriable: false,
    terminal: false,
    proof: [code('bonga.ts checks header.responseCode "200"')],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6000',
    success: true,
    canonicalMeaning: 'Success.',
    authoredMessage: 'Bonga redemption processed successfully.',
    retriable: false,
    terminal: true,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6001',
    success: false,
    canonicalMeaning: 'Fail.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6004',
    success: false,
    canonicalMeaning: 'Server error.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6005',
    success: false,
    canonicalMeaning: 'Invalid credentials passed.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6006',
    success: false,
    canonicalMeaning: 'Missing parts in the request body.',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6007',
    success: false,
    canonicalMeaning: 'CBS unavailable / system busy.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6008',
    success: false,
    canonicalMeaning: 'STK unavailable / system busy.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6009',
    success: false,
    canonicalMeaning: 'Broker unavailable / system busy.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '6011',
    success: false,
    canonicalMeaning: 'Database unavailable.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '1037',
    success: false,
    canonicalMeaning:
      "DS timeout — the customer doesn't have the STK applet / couldn't be reached.",
    authoredMessage:
      "The PIN prompt didn't reach the customer (no STK applet / phone unreachable). Ask them to update their SIM and retry.",
    retriable: true,
    terminal: false,
    errorClass: 'DarajaUserUnreachableError',
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '1031',
    success: false,
    canonicalMeaning: 'STK push timeout — the customer did not enter the PIN in time.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '2001',
    success: false,
    canonicalMeaning: 'Wrong PIN entered / initiator information invalid.',
    retriable: true,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },
  {
    scope: 'bonga',
    codeType: 'resultCode',
    code: '17',
    success: false,
    canonicalMeaning: 'Reversal fails due to account balance limit (KES 100,000).',
    retriable: false,
    terminal: false,
    proof: [{ kind: 'safaricom-docs', ref: 'Lipa na Bonga result codes' }],
  },

  // ── C2B validation reply codes (what the merchant SENDS) ─────────────────
  {
    scope: 'c2b',
    codeType: 'c2bReply',
    code: '0',
    success: true,
    canonicalMeaning: 'Accept the payment.',
    retriable: false,
    terminal: true,
    proof: [code('c2b.ts c2bAccept()')],
  },
  {
    scope: 'c2b',
    codeType: 'c2bReply',
    code: 'C2B00011',
    success: false,
    canonicalMeaning: 'Reject: invalid MSISDN.',
    retriable: false,
    terminal: false,
    proof: [code('c2b.ts c2bReject() docs')],
  },
  {
    scope: 'c2b',
    codeType: 'c2bReply',
    code: 'C2B00012',
    success: false,
    canonicalMeaning: 'Reject: invalid account number.',
    retriable: false,
    terminal: false,
    proof: [code('c2b.ts c2bReject() default')],
  },
  {
    scope: 'c2b',
    codeType: 'c2bReply',
    code: 'C2B00013',
    success: false,
    canonicalMeaning: 'Reject: invalid amount.',
    retriable: false,
    terminal: false,
    proof: [code('c2b.ts c2bReject() docs')],
  },
  {
    scope: 'c2b',
    codeType: 'c2bReply',
    code: 'C2B00016',
    success: false,
    canonicalMeaning: 'Reject: other.',
    retriable: false,
    terminal: false,
    proof: [code('c2b.ts c2bReject() docs')],
  },
];

/** Index for O(1) lookup. */
const INDEX = new Map<string, CatalogEntry>();
for (const e of CATALOG) {
  INDEX.set(`${e.scope}:${e.codeType}:${e.code}`, e);
}

/** Look up a catalogued code for a specific scope. Returns undefined if unproven. */
export function lookup(
  scope: DarajaScope,
  codeType: CodeType,
  code: string | number,
): CatalogEntry | undefined {
  return INDEX.get(`${scope}:${codeType}:${String(code)}`);
}

/**
 * Classify an async ResultCode for a scope. Never throws. Returns
 * `{ catalogued: false }` when the code is unproven (caller keeps Safaricom's
 * verbatim `resultDesc`).
 */
export function classify(
  scope: DarajaScope,
  resultCode: number | string,
  _resultDesc?: string,
): Classification {
  const entry = lookup(scope, 'resultCode', resultCode);
  if (!entry) {
    return { catalogued: false };
  }
  return {
    catalogued: true,
    meaning: entry.authoredMessage ?? entry.canonicalMeaning,
    retriable: entry.retriable,
    terminal: entry.terminal,
    errorClass: entry.errorClass,
  };
}

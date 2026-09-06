/**
 * Transaction status queries.
 *
 * - `stkPush` — query an STK Push outcome by CheckoutRequestID. SYNCHRONOUS:
 *   Daraja returns the result inline (no callback). Uses passkey auth.
 * - `transaction` — query any transaction by receipt, or by OriginatorConversationID
 *   when no receipt exists. ASYNC + initiator-authed; the result lands at your
 *   `resultUrl` (parse with `parseStatusResult`).
 */

import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';
import { generatePassword } from '../validation/password.js';
import { makeTimestamp } from '../validation/timestamp.js';

type StatusConfig = Pick<
  DarajaConfig,
  'shortcode' | 'passkey' | 'initiator' | 'securityCredential'
>;

export interface StkStatusInput {
  checkoutRequestId: string;
}

export interface StkStatusResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  resultCode: string;
  resultDesc: string;
  success: boolean;
}

interface StkStatusRaw {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  ResultCode?: string;
  ResultDesc?: string;
}

export interface TransactionStatusInput {
  /** M-Pesa receipt of the transaction to query, e.g. `NLJ7RT61SV`. Give this or `originatorConversationId`. */
  transactionId?: string;
  /**
   * OriginatorConversationID of the original request — for transactions that never
   * returned a receipt (lost callback). Safaricom accepts it in place of `TransactionID`.
   */
  originatorConversationId?: string;
  resultUrl: string;
  queueTimeoutUrl: string;
  remarks?: string;
  /** Identifier of PartyA. Default `4` (shortcode). */
  identifierType?: string;
}

export interface StatusAck {
  conversationId: string;
  originatorConversationId: string;
  responseCode: string;
  responseDescription: string;
}

interface AckRaw {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

export interface StatusResult extends CodeClassificationFields {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  originatorConversationId: string;
  transactionId: string;
  success: boolean;
  params: Record<string, unknown>;
  /** The `TransactionStatus` result parameter (e.g. `Completed`), verbatim. */
  transactionStatus?: string | undefined;
  /** The `ReceiptNo` result parameter — the M-Pesa receipt of the queried transaction. */
  receipt?: string | undefined;
}

interface ResultEnvelope {
  Result?: {
    ResultCode?: number;
    ResultDesc?: string;
    ConversationID?: string;
    OriginatorConversationID?: string;
    TransactionID?: string;
    ResultParameters?: { ResultParameter?: Array<{ Key: string; Value?: unknown }> };
  };
}

const STK_QUERY = '/mpesa/stkpushquery/v1/query';
const TX_QUERY = '/mpesa/transactionstatus/v1/query';

export async function stkPush(
  http: HttpClient,
  config: StatusConfig,
  input: StkStatusInput,
): Promise<StkStatusResult> {
  const timestamp = makeTimestamp();
  const raw = await http.post<StkStatusRaw>(
    STK_QUERY,
    {
      BusinessShortCode: Number(config.shortcode),
      Password: generatePassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: input.checkoutRequestId,
    },
    { retryable: true },
  ); // status query — safe to retry on 5xx
  return {
    merchantRequestId: raw.MerchantRequestID ?? '',
    checkoutRequestId: raw.CheckoutRequestID ?? input.checkoutRequestId,
    responseCode: raw.ResponseCode ?? '',
    responseDescription: raw.ResponseDescription ?? '',
    resultCode: raw.ResultCode ?? '',
    resultDesc: raw.ResultDesc ?? '',
    success: raw.ResultCode === '0',
  };
}

export async function transaction(
  http: HttpClient,
  config: StatusConfig,
  input: TransactionStatusInput,
): Promise<StatusAck> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError(
      'status.transaction requires config.initiator and config.securityCredential',
    );
  }
  // Trim only for the emptiness check; the wire body carries the ids verbatim so the
  // 1.4.1 body is byte-identical for every previously accepted (e.g. whitespace-padded) input.
  const transactionId = input.transactionId ?? '';
  const originatorConversationId = input.originatorConversationId ?? '';
  if (!transactionId.trim() && !originatorConversationId.trim()) {
    throw new DarajaValidationError(
      'status.transaction requires transactionId (receipt) or originatorConversationId',
    );
  }
  const body: Record<string, unknown> = {
    Initiator: config.initiator,
    SecurityCredential: config.securityCredential,
    CommandID: 'TransactionStatusQuery',
    // Safaricom requires the field; it is empty when querying by OriginatorConversationID.
    TransactionID: transactionId,
    PartyA: Number(config.shortcode),
    IdentifierType: input.identifierType ?? '4',
    Remarks: (input.remarks ?? 'Status query').slice(0, 100),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
  };
  // Only added when given, so the 1.4.1 receipt-only body is byte-identical.
  if (originatorConversationId.trim()) body.OriginatorConversationID = originatorConversationId;
  const raw = await http.post<AckRaw>(TX_QUERY, body, { retryable: true }); // status query — safe to retry on 5xx
  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'status',
      responseCode: raw.ResponseCode,
      errorMessage: raw.ResponseDescription,
      raw,
    });
  }
  return {
    conversationId: raw.ConversationID ?? '',
    originatorConversationId: raw.OriginatorConversationID ?? '',
    responseCode: raw.ResponseCode,
    responseDescription: raw.ResponseDescription ?? '',
  };
}

/** Parse the async Transaction Status result callback. */
export function parseStatusResult(body: unknown): StatusResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a status result envelope');
  }
  const params: Record<string, unknown> = {};
  for (const it of toArray(result.ResultParameters?.ResultParameter)) {
    params[it.Key] = it.Value;
  }
  // Lift the two fields callers branch on. Keys are matched with spaces removed and
  // case-folded because the portal shows them in more than one spelling.
  const fold = (k: string) => k.replace(/\s+/g, '').toLowerCase();
  let transactionStatus: string | undefined;
  let receipt: string | undefined;
  // Object.entries preserves insertion order, so if two keys fold to the same name
  // (e.g. both 'TransactionStatus' and 'Transaction Status' present) the last one wins.
  for (const [k, v] of Object.entries(params)) {
    const f = fold(k);
    if (f === 'transactionstatus' && v != null) transactionStatus = String(v);
    if (f === 'receiptno' && v != null) receipt = String(v);
  }
  const out: StatusResult = {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    transactionId: result.TransactionID ?? '',
    success: result.ResultCode === 0,
    params,
  };
  if (transactionStatus !== undefined) out.transactionStatus = transactionStatus;
  if (receipt !== undefined) out.receipt = receipt;
  return applyClassification(out, 'status', out.resultCode, out.resultDesc);
}

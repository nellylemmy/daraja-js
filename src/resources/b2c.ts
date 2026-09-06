/**
 * B2C — disburse money from your shortcode to a customer phone.
 *
 * B2C draws from the **Utility** account, not Working (gotcha #7) — fund it via
 * a B2B MMF→Utility transfer first. Requires initiator auth: set `initiator` +
 * `securityCredential` on the client (see `generateSecurityCredential`). The
 * call is async — the sync ack only confirms acceptance; the real outcome lands
 * at your `resultUrl`, parsed with `parseB2cResult`.
 *
 * Pass `originatorConversationId` to use B2C v3 with your own idempotency key; omit it for v1.
 */

import { randomUUID } from 'node:crypto';
import type { DarajaConfig } from '../client.js';
import { DarajaValidationError, errorFromResponse } from '../errors.js';
import type { HttpClient } from '../http.js';
import { toArray } from '../internal.js';
import { applyClassification, type CodeClassificationFields } from '../result-codes.js';
import { validateAmount } from '../validation/amount.js';
import { phoneToNumber } from '../validation/phone.js';

type B2cConfig = Pick<DarajaConfig, 'shortcode' | 'initiator' | 'securityCredential'>;

export type B2cCommandId = 'BusinessPayment' | 'SalaryPayment' | 'PromotionPayment';

export interface B2cSendInput {
  phone: string;
  amount: number;
  /** HTTPS URL Safaricom posts the async result to. */
  resultUrl: string;
  /** HTTPS URL for queue-timeout notifications. */
  queueTimeoutUrl: string;
  /** Default `BusinessPayment`. */
  commandId?: B2cCommandId;
  remarks?: string;
  occasion?: string;
  /**
   * Caller-generated OriginatorConversationID (idempotency / double-disbursement guard).
   * When given, the request goes to the B2C **v3** endpoint, which accepts it; when omitted,
   * the v1 endpoint and body are exactly those of 1.4.1.
   */
  originatorConversationId?: string;
}

export interface B2cSendResult {
  conversationId: string;
  originatorConversationId: string;
  responseCode: string;
  responseDescription: string;
}

interface B2cRaw {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

const ENDPOINT = '/mpesa/b2c/v1/paymentrequest';
const ENDPOINT_V3 = '/mpesa/b2c/v3/paymentrequest';

export async function send(
  http: HttpClient,
  config: B2cConfig,
  input: B2cSendInput,
): Promise<B2cSendResult> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError('b2c requires config.initiator and config.securityCredential');
  }
  const partyB = phoneToNumber(input.phone); // numeric MSISDN, throws on bad input
  const amount = validateAmount(input.amount);
  const ocid = input.originatorConversationId;
  if (ocid !== undefined && ocid.trim() === '') {
    throw new DarajaValidationError('originatorConversationId must not be blank');
  }

  const body: Record<string, unknown> = {
    InitiatorName: config.initiator,
    SecurityCredential: config.securityCredential,
    CommandID: input.commandId ?? 'BusinessPayment',
    Amount: amount,
    PartyA: Number(config.shortcode),
    PartyB: partyB,
    Remarks: (input.remarks ?? 'Payment').slice(0, 100),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
    Occasion: (input.occasion ?? '').slice(0, 100),
  };
  if (ocid !== undefined) body.OriginatorConversationID = ocid;

  const raw = await http.post<B2cRaw>(ocid !== undefined ? ENDPOINT_V3 : ENDPOINT, body);

  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'b2c',
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

const POCHI_ENDPOINT = '/mpesa/b2pochi/v1/paymentrequest';

export interface B2cToPochiInput {
  /** Customer MSISDN (2547…) — the business-wallet (pochi) recipient. */
  phone: string;
  amount: number;
  resultUrl: string;
  queueTimeoutUrl: string;
  /** Dedupe id (double-disbursement guard). Generated (UUID) if omitted. */
  originatorConversationId?: string;
  remarks?: string;
  occasion?: string;
}

/**
 * Business To Pochi — pay a customer's business wallet (pochi la biashara).
 * A B2C variant: own endpoint + `BusinessPayToPochi`, but reuses B2C auth, the
 * `ResponseCode "0"` ack, and `parseB2cResult`. Initiator-authed. Moves real money.
 */
export async function toPochi(
  http: HttpClient,
  config: B2cConfig,
  input: B2cToPochiInput,
): Promise<B2cSendResult> {
  if (!config.initiator || !config.securityCredential) {
    throw new DarajaValidationError('b2c requires config.initiator and config.securityCredential');
  }
  const partyB = phoneToNumber(input.phone);
  const amount = validateAmount(input.amount);
  const raw = await http.post<B2cRaw>(POCHI_ENDPOINT, {
    OriginatorConversationID: input.originatorConversationId ?? randomUUID(),
    InitiatorName: config.initiator,
    SecurityCredential: config.securityCredential,
    CommandID: 'BusinessPayToPochi',
    Amount: amount,
    PartyA: Number(config.shortcode),
    PartyB: partyB,
    Remarks: (input.remarks ?? 'Payment').slice(0, 100),
    QueueTimeOutURL: input.queueTimeoutUrl,
    ResultURL: input.resultUrl,
    Occassion: (input.occasion ?? '').slice(0, 100), // Safaricom's misspelling — sent exactly
  });
  if (raw.ResponseCode !== '0') {
    throw errorFromResponse({
      scope: 'b2c',
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

export interface B2cResult extends CodeClassificationFields {
  resultCode: number;
  resultDesc: string;
  conversationId: string;
  originatorConversationId: string;
  transactionId: string;
  success: boolean;
  mpesaReceipt?: string | undefined;
  amount?: number | undefined;
  recipientName?: string | undefined;
  completedAt?: string | undefined;
  utilityAccountFunds?: number | undefined;
  workingAccountFunds?: number | undefined;
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

function extractParams(items: Array<{ Key: string; Value?: unknown }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const it of items) {
    out[it.Key] = it.Value;
  }
  return out;
}

/** Parse the async B2C result callback. Accepts a parsed object or JSON string. */
export function parseB2cResult(body: unknown): B2cResult {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as ResultEnvelope | null;
  const result = o?.Result;
  if (!result || result.ResultCode == null) {
    throw new DarajaValidationError('not a B2C result envelope');
  }
  const p = extractParams(toArray(result.ResultParameters?.ResultParameter));

  const out: B2cResult = {
    resultCode: result.ResultCode,
    resultDesc: result.ResultDesc ?? '',
    conversationId: result.ConversationID ?? '',
    originatorConversationId: result.OriginatorConversationID ?? '',
    transactionId: result.TransactionID ?? '',
    success: result.ResultCode === 0,
  };
  if (p.TransactionReceipt != null) out.mpesaReceipt = String(p.TransactionReceipt);
  if (p.TransactionAmount != null) out.amount = Number(p.TransactionAmount);
  if (p.ReceiverPartyPublicName != null) out.recipientName = String(p.ReceiverPartyPublicName);
  if (p.TransactionCompletedDateTime != null)
    out.completedAt = String(p.TransactionCompletedDateTime);
  if (p.B2CUtilityAccountAvailableFunds != null) {
    out.utilityAccountFunds = Number(p.B2CUtilityAccountAvailableFunds);
  }
  if (p.B2CWorkingAccountAvailableFunds != null) {
    out.workingAccountFunds = Number(p.B2CWorkingAccountAvailableFunds);
  }
  return applyClassification(out, 'b2c', out.resultCode, out.resultDesc);
}

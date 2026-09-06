import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Daraja } from '../../src/client.js';
import { DarajaAPIError, DarajaValidationError } from '../../src/errors.js';
import { parseB2cResult } from '../../src/resources/b2c.js';

const SANDBOX = 'https://sandbox.safaricom.co.ke';
const ENDPOINT = `${SANDBOX}/mpesa/b2c/v1/paymentrequest`;
const ENDPOINT_V3 = `${SANDBOX}/mpesa/b2c/v3/paymentrequest`;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockOAuth() {
  server.use(
    http.get(`${SANDBOX}/oauth/v1/generate`, () =>
      HttpResponse.json({ access_token: 'tok-1', expires_in: 3599 }),
    ),
  );
}

function makeDaraja(overrides = {}) {
  return new Daraja({
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '600999',
    passkey: 'pk',
    environment: 'sandbox',
    initiator: 'KILELO',
    securityCredential: 'sec-cred',
    ...overrides,
  });
}

const ACCEPTED = {
  ConversationID: 'AG_conv_1',
  OriginatorConversationID: 'orig_1',
  ResponseCode: '0',
  ResponseDescription: 'Accept the service request successfully.',
};

describe('b2c.send', () => {
  it('posts the initiator-authed body with numeric PartyA/PartyB', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ACCEPTED);
      }),
    );

    const res = await makeDaraja().b2c.send({
      phone: '0712345678',
      amount: 500,
      resultUrl: 'https://example.com/b2c/result',
      queueTimeoutUrl: 'https://example.com/b2c/timeout',
      remarks: 'Salary',
    });

    expect(body.InitiatorName).toBe('KILELO');
    expect(body.SecurityCredential).toBe('sec-cred');
    expect(body.CommandID).toBe('BusinessPayment'); // default
    expect(body.Amount).toBe(500);
    expect(body.PartyA).toBe(600999); // numeric shortcode
    expect(typeof body.PartyB).toBe('number');
    expect(body.PartyB).toBe(254712345678); // numeric MSISDN
    expect(body.Remarks).toBe('Salary');
    expect(body.QueueTimeOutURL).toBe('https://example.com/b2c/timeout');
    expect(body.ResultURL).toBe('https://example.com/b2c/result');

    expect(res.conversationId).toBe('AG_conv_1');
    expect(res.originatorConversationId).toBe('orig_1');
    expect(res.responseCode).toBe('0');
  });

  it('honors an explicit CommandID', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ACCEPTED);
      }),
    );
    await makeDaraja().b2c.send({
      phone: '254712345678',
      amount: 1,
      commandId: 'SalaryPayment',
      resultUrl: 'https://example.com/r',
      queueTimeoutUrl: 'https://example.com/t',
    });
    expect(body.CommandID).toBe('SalaryPayment');
  });

  it('throws DarajaValidationError when initiator/securityCredential are missing', async () => {
    const daraja = makeDaraja({ initiator: undefined, securityCredential: undefined });
    await expect(
      daraja.b2c.send({
        phone: '254712345678',
        amount: 1,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('rejects an invalid phone before any network call', async () => {
    await expect(
      makeDaraja().b2c.send({
        phone: 'nope',
        amount: 1,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });

  it('throws DarajaAPIError on a non-zero ResponseCode', async () => {
    mockOAuth();
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ ResponseCode: '2001', ResponseDescription: 'Bad initiator' }),
      ),
    );
    await expect(
      makeDaraja().b2c.send({
        phone: '254712345678',
        amount: 1,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
  });

  it('does NOT retry on 5xx — payment-safe (single attempt, no double-disbursement)', async () => {
    mockOAuth();
    let calls = 0;
    server.use(
      http.post(ENDPOINT, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    await expect(
      makeDaraja().b2c.send({
        phone: '254712345678',
        amount: 100,
        resultUrl: 'https://example.com/r',
        queueTimeoutUrl: 'https://example.com/t',
      }),
    ).rejects.toBeInstanceOf(DarajaAPIError);
    expect(calls).toBe(1); // money-mover: never re-sent on 5xx
  });

  it('uses the v3 endpoint and sends OriginatorConversationID when the caller supplies one', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    let hitV1 = false;
    server.use(
      http.post(ENDPOINT, () => {
        hitV1 = true;
        return HttpResponse.json(ACCEPTED);
      }),
      http.post(ENDPOINT_V3, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...ACCEPTED, OriginatorConversationID: 'studio-4f3c' });
      }),
    );

    const res = await makeDaraja().b2c.send({
      phone: '0792471415',
      amount: 1,
      originatorConversationId: 'studio-4f3c',
      resultUrl: 'https://example.com/b2c/result',
      queueTimeoutUrl: 'https://example.com/b2c/timeout',
    });

    // pinned by docs/specs/b2c-v3.md
    expect(hitV1).toBe(false);
    expect(body.OriginatorConversationID).toBe('studio-4f3c');
    expect(body.InitiatorName).toBe('KILELO');
    expect(body.CommandID).toBe('BusinessPayment');
    expect(body.Amount).toBe(1);
    expect(body.PartyA).toBe(600999);
    expect(body.PartyB).toBe(254792471415);
    expect(res.originatorConversationId).toBe('studio-4f3c');
  });

  it('keeps the v1 endpoint and body when no originatorConversationId is given (1.4.1 unchanged)', async () => {
    mockOAuth();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ACCEPTED);
      }),
      http.post(ENDPOINT_V3, () => {
        throw new Error('v3 must not be called without an originatorConversationId');
      }),
    );
    await makeDaraja().b2c.send({
      phone: '254792471415',
      amount: 1,
      resultUrl: 'https://example.com/b2c/result',
      queueTimeoutUrl: 'https://example.com/b2c/timeout',
    });
    // pinned by docs/specs/b2c-v3.md
    expect('OriginatorConversationID' in body).toBe(false);
  });

  it('rejects a blank originatorConversationId', async () => {
    await expect(
      makeDaraja().b2c.send({
        phone: '254792471415',
        amount: 1,
        originatorConversationId: '  ',
        resultUrl: 'https://example.com/b2c/result',
        queueTimeoutUrl: 'https://example.com/b2c/timeout',
      }),
    ).rejects.toBeInstanceOf(DarajaValidationError);
  });
});

describe('parseB2cResult', () => {
  const success = {
    Result: {
      ResultType: 0,
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      OriginatorConversationID: 'orig_1',
      ConversationID: 'AG_conv_1',
      TransactionID: 'NLJ7RT61SV',
      ResultParameters: {
        ResultParameter: [
          { Key: 'TransactionReceipt', Value: 'NLJ7RT61SV' },
          { Key: 'TransactionAmount', Value: 500 },
          { Key: 'ReceiverPartyPublicName', Value: '254712345678 - John Doe' },
          { Key: 'TransactionCompletedDateTime', Value: '19.12.2019 11:45:50' },
          { Key: 'B2CUtilityAccountAvailableFunds', Value: 10000 },
        ],
      },
    },
  };

  it('parses a successful B2C result', () => {
    const r = parseB2cResult(success);
    expect(r.success).toBe(true);
    expect(r.resultCode).toBe(0);
    expect(r.transactionId).toBe('NLJ7RT61SV');
    expect(r.mpesaReceipt).toBe('NLJ7RT61SV');
    expect(r.amount).toBe(500);
    expect(r.recipientName).toBe('254712345678 - John Doe');
    expect(r.utilityAccountFunds).toBe(10000);
  });

  it('parses a failed B2C result (no params)', () => {
    const r = parseB2cResult({
      Result: {
        ResultCode: 2001,
        ResultDesc: 'Initiator information is invalid',
        ConversationID: 'c',
      },
    });
    expect(r.success).toBe(false);
    expect(r.resultCode).toBe(2001);
    expect(r.mpesaReceipt).toBeUndefined();
  });

  it('throws on a non-result envelope', () => {
    expect(() => parseB2cResult({ foo: 'bar' })).toThrow(DarajaValidationError);
  });
});

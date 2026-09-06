import { describe, expect, it } from 'vitest';
import { CATALOG, classify, lookup } from '../../src/result-codes.js';

describe('CATALOG proof invariant', () => {
  it('every entry with an authoredMessage cites at least one proof source', () => {
    for (const e of CATALOG) {
      if (e.authoredMessage) {
        expect(e.proof.length, `${e.scope}:${e.code} authored but unproven`).toBeGreaterThan(0);
      }
    }
  });

  it('only uses the existing error classes (no new ones invented)', () => {
    const allowed = new Set([
      undefined,
      'DarajaAPIError',
      'DarajaInsufficientFundsError',
      'DarajaCancelledError',
      'DarajaUserUnreachableError',
    ]);
    for (const e of CATALOG) {
      expect(allowed.has(e.errorClass)).toBe(true);
    }
  });
});

describe('lookup', () => {
  it('finds a production-proven scoped code', () => {
    const e = lookup('stk', 'resultCode', '1037');
    expect(e?.canonicalMeaning).toMatch(/unreachable|timeout/i);
    expect(e?.errorClass).toBe('DarajaUserUnreachableError');
  });

  it('normalizes numeric codes to string', () => {
    expect(lookup('stk', 'resultCode', 1037)).toBe(lookup('stk', 'resultCode', '1037'));
  });

  it('is scope-specific — a code proven for one API is not assumed for another', () => {
    // 2 = "below minimum" is proven for b2c; not asserted for stk
    expect(lookup('b2c', 'resultCode', '2')?.authoredMessage).toBeTruthy();
    expect(lookup('stk', 'resultCode', '2')).toBeUndefined();
  });

  it('keeps QR success on "00" distinct from "0"', () => {
    expect(lookup('qr', 'responseCode', '00')?.success).toBe(true);
    expect(lookup('qr', 'responseCode', '0')).toBeUndefined();
  });

  it('catalogues the non-numeric B2B code observed in production', () => {
    expect(lookup('b2b', 'resultCode', 'SFC_IC0003')?.canonicalMeaning).toMatch(/receiver/i);
  });

  it('returns undefined for an unproven code', () => {
    expect(lookup('stk', 'resultCode', '9999')).toBeUndefined();
  });

  it('catalogues the initiator-credential failures (2001 invalid, 8006 locked) for b2c, and 2001 for b2b', () => {
    for (const [scope, code] of [
      ['b2c', '2001'],
      ['b2b', '2001'],
    ] as const) {
      const invalid = lookup(scope, 'resultCode', code);
      expect(invalid?.success).toBe(false);
      expect(invalid?.canonicalMeaning).toMatch(/initiator information is invalid/i);
      expect(invalid?.authoredMessage).toMatch(/operator|initiator/i);
      expect(invalid?.retriable).toBe(false);
      expect(invalid?.terminal).toBe(true);
    }
    const locked = lookup('b2c', 'resultCode', '8006');
    expect(locked?.success).toBe(false);
    expect(locked?.canonicalMeaning).toMatch(/locked/i);
    expect(locked?.retriable).toBe(false);
    expect(locked?.terminal).toBe(true);
    // Not yet proven for a b2b endpoint — deliberately absent.
    expect(lookup('b2b', 'resultCode', '8006')).toBeUndefined();
    // Still scope-specific: 2001 on stk is not asserted.
    expect(lookup('stk', 'resultCode', '2001')).toBeUndefined();
  });
});

describe('classify', () => {
  it('returns catalogued meaning + retriable for a proven failure', () => {
    const c = classify('b2c', 1, 'The balance is insufficient for the transaction.');
    expect(c.catalogued).toBe(true);
    expect(c.meaning).toBeTruthy();
    expect(c.retriable).toBe(true);
  });

  it('returns catalogued:false for an unproven code (verbatim passthrough)', () => {
    const c = classify('b2c', 9999, 'Some undocumented failure');
    expect(c.catalogued).toBe(false);
    expect(c.meaning).toBeUndefined();
  });

  it('treats ResultCode 0 as a catalogued success', () => {
    expect(classify('balance', 0).catalogued).toBe(true);
  });
});

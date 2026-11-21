import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashPassword, randomHex, sha256, verifyPassword } from '../src/crypto.ts';
import { credentials, eventId } from '../src/validation.ts';

describe('password hashing', () => {
  test('stores a 16-byte salt and a 64-byte PBKDF2 key as hex', async () => {
    assert.match(await hashPassword('correct horse battery'), /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  test('uses a fresh salt, so the same password never produces the same hash', async () => {
    const [first, second] = await Promise.all([hashPassword('repeated-password'), hashPassword('repeated-password')]);
    assert.notEqual(first, second);
    assert.notEqual(first.split(':')[0], second.split(':')[0]);
  });

  test('accepts the correct password', async () => {
    const stored = await hashPassword('s3cret-password');
    assert.equal(await verifyPassword('s3cret-password', stored), true);
  });

  test('rejects a wrong password, including one that differs only in case', async () => {
    const stored = await hashPassword('s3cret-password');
    assert.equal(await verifyPassword('wrong-password', stored), false);
    assert.equal(await verifyPassword('S3CRET-PASSWORD', stored), false);
  });

  test('rejects an unknown user without throwing', async () => {
    assert.equal(await verifyPassword('any-password', undefined), false);
  });

  test('rejects a tampered or truncated stored hash', async () => {
    const stored = await hashPassword('s3cret-password');
    const [salt, key] = stored.split(':');
    const flipped = `${salt}:${key.slice(0, -1)}${key.endsWith('0') ? '1' : '0'}`;
    assert.equal(await verifyPassword('s3cret-password', flipped), false);
    assert.equal(await verifyPassword('s3cret-password', `${salt}:${key.slice(0, 64)}`), false);
  });
});

describe('session tokens', () => {
  test('sha256 matches the NIST test vector', async () => {
    assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('randomHex(32) returns 64 hex characters, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomHex(32)));
    assert.equal(tokens.size, 50);
    for (const token of tokens) assert.match(token, /^[0-9a-f]{64}$/);
  });
});

describe('credentials validation', () => {
  test('normalizes the email to trimmed lowercase and keeps the password untouched', () => {
    assert.deepEqual(credentials({ email: '  Ana.Lopez@ITESO.MX ', password: ' Pa ss 123 ' }),
      { email: 'ana.lopez@iteso.mx', password: ' Pa ss 123 ' });
  });

  test('accepts passwords of exactly 8 and 128 characters', () => {
    assert.notEqual(credentials({ email: 'a@b.mx', password: 'x'.repeat(8) }), null);
    assert.notEqual(credentials({ email: 'a@b.mx', password: 'x'.repeat(128) }), null);
  });

  test('rejects passwords shorter than 8 or longer than 128 characters', () => {
    assert.equal(credentials({ email: 'a@b.mx', password: 'x'.repeat(7) }), null);
    assert.equal(credentials({ email: 'a@b.mx', password: 'x'.repeat(129) }), null);
  });

  test('rejects malformed or overly long emails', () => {
    for (const email of ['', 'sin-arroba.mx', 'a@b', 'a b@c.mx', '@b.mx', `${'a'.repeat(250)}@b.mx`]) {
      assert.equal(credentials({ email, password: 'valid-password' }), null, email);
    }
  });

  test('rejects missing bodies and non-string values', () => {
    for (const body of [null, undefined, {}, { email: 'a@b.mx' }, { password: 'valid-password' },
      { email: ['a@b.mx'], password: 'valid-password' }, { email: 'a@b.mx', password: 12345678 }]) {
      assert.equal(credentials(body), null);
    }
  });
});

describe('event id parameter', () => {
  test('accepts positive integers within the SQL integer range', () => {
    assert.equal(eventId('1'), 1);
    assert.equal(eventId('2147483647'), 2147483647);
  });

  test('rejects zero, leading zeros, negatives, decimals, text and overflow', () => {
    for (const value of ['0', '01', '-1', '1.5', 'abc', '', '2147483648']) {
      assert.equal(eventId(value), null, value);
    }
  });
});

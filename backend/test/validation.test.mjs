import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventInput } from '../src/admin.ts';
import { positiveInteger } from '../src/customer.ts';

const event = {
  title: ' EventHub ', venue: ' Foro ', description: ' Demo ',
  startsAt: '2030-01-02T18:00:00-06:00', capacity: 20
};

test('normalizes event text and date for persistence', () => {
  assert.deepEqual(eventInput(event), ['EventHub', 'Foro', 'Demo', '2030-01-03T00:00:00.000Z', 20]);
});

test('rejects missing or malformed event fields', () => {
  for (const invalid of [null, {}, { ...event, title: ' ' },
    { ...event, venue: 'a'.repeat(161) }, { ...event, startsAt: 'invalid' }]) {
    assert.equal(eventInput(invalid), null);
  }
});

test('validates positive integers within the PostgreSQL integer range', () => {
  for (const invalid of [0, -1, 1.5, '2', NaN, Infinity, 2147483648]) {
    assert.equal(positiveInteger(invalid), false);
    assert.equal(eventInput({ ...event, capacity: invalid }), null);
  }
  assert.equal(positiveInteger(1), true);
  assert.equal(positiveInteger(2147483647), true);
});

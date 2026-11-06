'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateFlightNumber, resolveCallsigns, canonicalCallsign, lookupFlight } = require('../lib/flight');

const state = (callsign, over = {}) => {
  const s = new Array(17).fill(null);
  s[0] = '800123'; s[1] = callsign; s[2] = 'India'; s[3] = 1700000000; s[4] = 1700000002;
  s[5] = 80.27; s[6] = 13.08; s[7] = 10500; s[8] = false; s[9] = 230; s[10] = 145;
  return Object.assign(s, over);
};
const fakeFetch = (states, ok = true, status = 200) => async () => ({ ok, status, json: async () => ({ states }) });

test('validates flight numbers', () => {
  assert.strictEqual(validateFlightNumber(' ai302 '), 'AI302');
  assert.strictEqual(validateFlightNumber('6e624'), '6E624');
  assert.strictEqual(validateFlightNumber('axb2935'), 'AXB2935');
  assert.throws(() => validateFlightNumber('!!'), { status: 400 });
  assert.throws(() => validateFlightNumber('AI'), { status: 400 });
});

test('resolves callsigns', () => {
  assert.deepStrictEqual(resolveCallsigns('AI302'), ['AIC302', 'AI302']);
  assert.deepStrictEqual(resolveCallsigns('6E624'), ['IGO624', '6E624']);
  assert.deepStrictEqual(resolveCallsigns('TK123'), ['THY123', 'TK123']); // from bundled DB
  assert.deepStrictEqual(resolveCallsigns('AXB2935'), ['AXB2935']); // ICAO callsign
  assert.deepStrictEqual(resolveCallsigns('ZZ1'), ['ZZ1']); // unknown prefix still searchable
  assert.deepStrictEqual(resolveCallsigns('AI302', 'xyz123'), ['XYZ123']);
  assert.throws(() => resolveCallsigns('AI302', 'b!'), { status: 400 });
});

test('canonicalCallsign strips padding and zeros', () => {
  assert.strictEqual(canonicalCallsign('IGO0624 '), 'IGO624');
});

test('success', async () => {
  const r = await lookupFlight('AI302', undefined, { fetch: fakeFetch([state('AIC302  ')]) });
  assert.strictEqual(r.status, 'airborne');
  assert.strictEqual(r.callsign, 'AIC302');
  assert.strictEqual(r.position.latitude, 13.08);
});

test('not found is 404', async () => {
  await assert.rejects(lookupFlight('AI302', undefined, { fetch: fakeFetch([]) }), { status: 404 });
});

test('upstream error is 502', async () => {
  await assert.rejects(lookupFlight('AI302', undefined, { fetch: fakeFetch([], false, 503) }), { status: 502 });
});

test('timeout is 504', async () => {
  const slow = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(lookupFlight('AI302', undefined, { fetch: slow, timeoutMs: 10 }), { status: 504 });
});

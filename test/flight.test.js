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

// ---- aviationstack ----
const asFetch = (data) => async () => ({ ok: true, status: 200, json: async () => ({ data }) });
const AS = (over = {}) => ({
  flight_date: '2026-11-06', flight_status: 'active',
  departure: { iata: 'DEL', airport: 'Indira Gandhi', terminal: '3', gate: 'A1', delay: 5, scheduled: '2026-11-06T10:00:00+00:00', actual: '2026-11-06T10:05:00+00:00' },
  arrival: { iata: 'MAA', delay: 12, scheduled: '2026-11-06T12:30:00+00:00', estimated: '2026-11-06T12:42:00+00:00' },
  airline: { name: 'Air India', iata: 'AI', icao: 'AIC' },
  flight: { iata: 'AI302', icao: 'AIC302' },
  aircraft: { registration: 'VT-ABC', icao: 'A320', icao24: '800123' },
  live: { updated: '2026-11-06T11:00:00+00:00', latitude: 13.1, longitude: 80.2, altitude: 10000, direction: 90, speed_horizontal: 720, speed_vertical: 0, is_ground: false },
  ...over,
});

test('aviationstack live flight', async () => {
  const r = await lookupFlight('AI302', undefined, { apiKey: 'k', fetch: asFetch([AS()]) });
  assert.strictEqual(r.dataSource, 'aviationstack');
  assert.strictEqual(r.status, 'airborne');
  assert.strictEqual(r.speedMetersPerSecond, 200);
  assert.strictEqual(r.route.departure.iata, 'DEL');
  assert.strictEqual(r.schedule.arrivalDelayMinutes, 12);
  assert.strictEqual(r.schedule.scheduledDeparture, '2026-11-06T10:00:00.000Z');
  assert.strictEqual(r.position.latitude, 13.1);
});

test('aviationstack prefers airborne flight over landed one', async () => {
  const landed = AS({ flight_status: 'landed', live: null, flight_date: '2026-11-07' });
  const r = await lookupFlight('AI302', undefined, { apiKey: 'k', fetch: asFetch([landed, AS()]) });
  assert.strictEqual(r.status, 'airborne');
});

test('aviationstack scheduled/cancelled has null position', async () => {
  const r = await lookupFlight('AI302', undefined, { apiKey: 'k', fetch: asFetch([AS({ flight_status: 'cancelled', live: null })]) });
  assert.strictEqual(r.status, 'cancelled');
  assert.strictEqual(r.position, null);
});

test('aviationstack sends flight_iata / flight_icao and key', async () => {
  let url;
  const f = async (u) => { url = u; return { ok: true, json: async () => ({ data: [AS()] }) }; };
  await lookupFlight('AI302', undefined, { apiKey: 'KEY1', fetch: f });
  assert.match(url, /flight_iata=AI302/); assert.match(url, /access_key=KEY1/);
  await lookupFlight('AXB2935', undefined, { apiKey: 'KEY1', fetch: f });
  assert.match(url, /flight_icao=AXB2935/);
});

const osOnly = (fn) => async (url) => (url.includes('aviationstack') ? fn() : { ok: true, json: async () => ({ states: [state('AIC302')] }) });

test('aviationstack miss falls back to OpenSky', async () => {
  const r = await lookupFlight('AI302', undefined, { apiKey: 'k', fetch: osOnly(() => ({ ok: true, json: async () => ({ data: [] }) })) });
  assert.strictEqual(r.dataSource, 'OpenSky Network');
});

test('aviationstack error (e.g. usage limit) falls back, never leaks provider text', async () => {
  const r = await lookupFlight('AI302', undefined, { apiKey: 'k', fetch: osOnly(() => ({ ok: true, json: async () => ({ error: { code: 'usage_limit_reached', message: 'secret?access_key=k' } }) })) });
  assert.strictEqual(r.dataSource, 'OpenSky Network');
});

test('no key -> OpenSky only', async () => {
  const f = async (url) => { assert.ok(!url.includes('aviationstack')); return { ok: true, json: async () => ({ states: [state('AIC302')] }) }; };
  const r = await lookupFlight('AI302', undefined, { apiKey: '', fetch: f });
  assert.strictEqual(r.dataSource, 'OpenSky Network');
});

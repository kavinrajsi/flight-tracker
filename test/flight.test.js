'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateFlightNumber, lookupFlight } = require('../lib/flight');

test('validates flight numbers', () => {
  assert.strictEqual(validateFlightNumber(' ai302 '), 'AI302');
  assert.strictEqual(validateFlightNumber('6e624'), '6E624');
  assert.strictEqual(validateFlightNumber('axb2935'), 'AXB2935');
  assert.throws(() => validateFlightNumber('!!'), { status: 400 });
  assert.throws(() => validateFlightNumber('AI'), { status: 400 });
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

test('aviationstack miss is 404 and does not imply cancellation', async () => {
  await assert.rejects(lookupFlight('AI302', undefined, { apiKey: 'k', fetch: asFetch([]) }), (e) => e.status === 404 && /does not mean/.test(e.message));
});

test('aviationstack error (e.g. usage limit) is 502, never leaks provider text', async () => {
  const f = async () => ({ ok: true, json: async () => ({ error: { code: 'usage_limit_reached', message: 'secret?access_key=k' } }) });
  await assert.rejects(lookupFlight('AI302', undefined, { apiKey: 'k', fetch: f }), (e) => e.status === 502 && !/secret|access_key/.test(e.message));
});

test('aviationstack HTTP failure is 502', async () => {
  const f = async () => ({ ok: false, status: 500, json: async () => null });
  await assert.rejects(lookupFlight('AI302', undefined, { apiKey: 'k', fetch: f }), { status: 502 });
});

test('aviationstack timeout is 504', async () => {
  const slow = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(lookupFlight('AI302', undefined, { apiKey: 'k', fetch: slow, timeoutMs: 10 }), { status: 504 });
});

test('missing API key is 500', async () => {
  await assert.rejects(lookupFlight('AI302', undefined, { apiKey: '' }), { status: 500 });
});

test('callsign override uses flight_icao', async () => {
  let url;
  const f = async (u) => { url = u; return { ok: true, json: async () => ({ data: [AS()] }) }; };
  await lookupFlight('AI302', 'aic302', { apiKey: 'k', fetch: f });
  assert.match(url, /flight_icao=AIC302/);
  await assert.rejects(lookupFlight('AI302', 'b!', { apiKey: 'k', fetch: f }), { status: 400 });
});

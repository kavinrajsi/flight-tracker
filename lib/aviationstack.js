'use strict';

const { HttpError } = require('./errors');

// Free aviationstack plans only serve plain HTTP (the key travels unencrypted, server to server).
// Paid plans: set AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1
const DEFAULT_BASE = 'http://api.aviationstack.com/v1';

const STATUS_MAP = {
  active: 'airborne',
  scheduled: 'scheduled',
  landed: 'landed',
  cancelled: 'cancelled',
  incident: 'incident',
  diverted: 'diverted',
};

const iso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function call(params, key, deps = {}) {
  const base = deps.baseUrl || process.env.AVIATIONSTACK_BASE_URL || DEFAULT_BASE;
  const fetchImpl = deps.fetch || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs || 8000);
  try {
    const qs = new URLSearchParams({ ...params, access_key: key, limit: '10' });
    const res = await fetchImpl(`${base}/flights?${qs}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (body && body.error) {
      // Never forward provider messages: they can echo the request URL (including the key).
      console.error('aviationstack error', body.error.code, body.error.type);
      throw new HttpError(502, 'Aviationstack returned an error.');
    }
    if (!res.ok || !body) throw new HttpError(502, `Aviationstack returned HTTP ${res.status}.`);
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') throw new HttpError(504, 'Aviationstack request timed out.');
    throw new HttpError(502, 'Could not reach Aviationstack.');
  } finally {
    clearTimeout(timer);
  }
}

function toResponse(flightNumber, f) {
  const dep = f.departure || {}, arr = f.arrival || {}, live = f.live || null, ac = f.aircraft || {};
  const hasPos = live && num(live.latitude) != null && num(live.longitude) != null;
  return {
    flightNumber,
    callsign: (f.flight && f.flight.icao) || null,
    status: STATUS_MAP[f.flight_status] || f.flight_status || 'unknown',
    airline: { name: (f.airline && f.airline.name) || null, iata: (f.airline && f.airline.iata) || null, icao: (f.airline && f.airline.icao) || null },
    aircraft: {
      icao24: ac.icao24 || null,
      originCountry: null,
      registration: ac.registration || null,
      type: ac.icao || null,
    },
    route: {
      departure: { airport: dep.airport || null, iata: dep.iata || null, icao: dep.icao || null, terminal: dep.terminal || null, gate: dep.gate || null },
      arrival: { airport: arr.airport || null, iata: arr.iata || null, icao: arr.icao || null, terminal: arr.terminal || null, gate: arr.gate || null, baggage: arr.baggage || null },
    },
    schedule: {
      scheduledDeparture: iso(dep.scheduled),
      estimatedDeparture: iso(dep.estimated),
      actualDeparture: iso(dep.actual),
      scheduledArrival: iso(arr.scheduled),
      estimatedArrival: iso(arr.estimated),
      actualArrival: iso(arr.actual),
      departureDelayMinutes: num(dep.delay),
      arrivalDelayMinutes: num(arr.delay),
    },
    position: hasPos ? { latitude: live.latitude, longitude: live.longitude } : null,
    altitudeMeters: live ? num(live.altitude) : null,
    // aviationstack speeds are km/h; our contract is m/s.
    speedMetersPerSecond: live && num(live.speed_horizontal) != null ? live.speed_horizontal / 3.6 : null,
    headingDegrees: live ? num(live.direction) : null,
    verticalRateMetersPerSecond: live && num(live.speed_vertical) != null ? live.speed_vertical / 3.6 : null,
    lastPositionUpdate: live ? iso(live.updated) : null,
    lastContact: live ? iso(live.updated) : null,
    dataSource: 'aviationstack',
  };
}

// Prefer a flight currently in the air, then the most recent flight date.
function rank(f) {
  const airborne = f.flight_status === 'active' && f.live ? 2 : f.flight_status === 'active' ? 1 : 0;
  return [airborne, f.flight_date || ''];
}

/** Returns a response object, or null if aviationstack has no such flight. */
async function lookupAviationstack(flightNumber, callsignOverride, deps = {}) {
  const useIcao = Boolean(callsignOverride) || /^[A-Z]{3}\d/.test(flightNumber);
  const q = useIcao
    ? { flight_icao: String(callsignOverride || flightNumber).toUpperCase() }
    : { flight_iata: flightNumber };
  const list = await call(q, deps.apiKey, deps);
  if (!list.length) return null;
  list.sort((a, b) => {
    const [ra, da] = rank(a), [rb, db] = rank(b);
    return rb - ra || (db < da ? -1 : db > da ? 1 : 0);
  });
  return toResponse(flightNumber, list[0]);
}

module.exports = { lookupAviationstack, toResponse, STATUS_MAP };

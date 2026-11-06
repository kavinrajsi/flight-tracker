'use strict';

// Illustrative IATA -> ICAO airline prefix map. VERIFY AND MAINTAIN before production use.
const AIRLINE_PREFIXES = {
  AI: 'AIC', // Air India
  '6E': 'IGO', // IndiGo
  UK: 'VTI', // Vistara
  SG: 'SEJ', // SpiceJet
  IX: 'AXB', // Air India Express
  QP: 'AKJ', // Akasa Air
  EK: 'UAE', // Emirates
  QR: 'QTR', // Qatar Airways
  SQ: 'SIA', // Singapore Airlines
  BA: 'BAW', // British Airways
  LH: 'DLH', // Lufthansa
  AF: 'AFR', // Air France
  KL: 'KLM', // KLM
  AA: 'AAL', // American Airlines
  UA: 'UAL', // United Airlines
  DL: 'DAL', // Delta Air Lines
};

const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const CALLSIGN_RE = /^[A-Z0-9]{3,8}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeFlightNumber(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
}

function validateFlightNumber(raw) {
  const fn = normalizeFlightNumber(raw);
  if (!FLIGHT_NUMBER_RE.test(fn)) {
    throw new HttpError(400, 'Invalid flight number. Expected an airline code and number, e.g. AI302 or 6E624.');
  }
  return fn;
}

function resolveCallsign(flightNumber, override) {
  if (override) {
    const cs = String(override).replace(/\s+/g, '').toUpperCase();
    if (!CALLSIGN_RE.test(cs)) throw new HttpError(400, 'Invalid callsign override.');
    return cs;
  }
  const prefix = flightNumber.slice(0, 2);
  const icao = AIRLINE_PREFIXES[prefix];
  if (!icao) {
    throw new HttpError(
      400,
      `No callsign mapping for airline prefix "${prefix}". Supply one with ?callsign=ICAO123.`
    );
  }
  return icao + flightNumber.slice(2);
}

// "IGO0624 " and "IGO624" should compare equal.
function canonicalCallsign(cs) {
  const m = /^([A-Z]{3})0*(\d+[A-Z]?)$/.exec(String(cs || '').trim().toUpperCase());
  return m ? m[1] + m[2] : String(cs || '').trim().toUpperCase();
}

const iso = (unixSeconds) => (unixSeconds == null ? null : new Date(unixSeconds * 1000).toISOString());

function toAircraftResponse(flightNumber, callsign, s) {
  const [icao24, , originCountry, timePosition, lastContact, lon, lat, baroAlt, onGround, velocity, track, vRate, , geoAlt] = s;
  return {
    flightNumber,
    callsign: String(s[1]).trim(),
    status: onGround ? 'on-ground' : 'airborne',
    aircraft: { icao24, originCountry },
    position: lat != null && lon != null ? { latitude: lat, longitude: lon } : null,
    altitudeMeters: baroAlt ?? geoAlt ?? null,
    speedMetersPerSecond: velocity ?? null,
    headingDegrees: track ?? null,
    verticalRateMetersPerSecond: vRate ?? null,
    lastPositionUpdate: iso(timePosition),
    lastContact: iso(lastContact),
    dataSource: 'OpenSky Network',
    note: 'Observed aircraft tracking data, not verified airline status.',
  };
}

async function fetchStates(fetchImpl = fetch, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('https://opensky-network.org/api/states/all', {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new HttpError(502, `OpenSky returned HTTP ${res.status}.`);
    const body = await res.json();
    return Array.isArray(body.states) ? body.states : [];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') throw new HttpError(504, 'OpenSky request timed out.');
    throw new HttpError(502, 'Could not reach OpenSky.');
  } finally {
    clearTimeout(timer);
  }
}

async function lookupFlight(rawFlightNumber, callsignOverride, deps = {}) {
  const flightNumber = validateFlightNumber(rawFlightNumber);
  const callsign = resolveCallsign(flightNumber, callsignOverride);
  const states = await fetchStates(deps.fetch, deps.timeoutMs);
  const want = canonicalCallsign(callsign);
  const matches = states
    .filter((s) => canonicalCallsign(s[1]) === want)
    .sort((a, b) => (b[4] || 0) - (a[4] || 0));
  if (!matches.length) {
    throw new HttpError(
      404,
      `No aircraft with callsign ${callsign} is currently found in OpenSky tracking data. This does not mean the flight is cancelled or does not exist.`
    );
  }
  return toAircraftResponse(flightNumber, callsign, matches[0]);
}

module.exports = {
  AIRLINE_PREFIXES,
  HttpError,
  validateFlightNumber,
  resolveCallsign,
  canonicalCallsign,
  toAircraftResponse,
  lookupFlight,
};

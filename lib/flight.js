'use strict';

const { HttpError } = require('./errors');
const { lookupAviationstack } = require('./aviationstack');

const FLIGHT_NUMBER_RE = /^([A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/;
const CALLSIGN_RE = /^[A-Z0-9]{3,8}$/;

function normalizeFlightNumber(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
}

function validateFlightNumber(raw) {
  const fn = normalizeFlightNumber(raw);
  if (!FLIGHT_NUMBER_RE.test(fn)) {
    throw new HttpError(400, 'Invalid flight number. Expected an airline code and number, e.g. AI302, 6E624 or AXB2935.');
  }
  return fn;
}

function validateCallsign(raw) {
  if (raw == null || raw === '') return undefined;
  const cs = String(raw).replace(/\s+/g, '').toUpperCase();
  if (!CALLSIGN_RE.test(cs)) throw new HttpError(400, 'Invalid callsign override.');
  return cs;
}

/**
 * Looks a flight up in aviationstack (AVIATIONSTACK_API_KEY, server-side only).
 * Accepts IATA (AI302) or ICAO (AIC302) flight numbers; ?callsign= overrides with an ICAO flight code.
 */
async function lookupFlight(rawFlightNumber, callsignOverride, deps = {}) {
  const flightNumber = validateFlightNumber(rawFlightNumber);
  const callsign = validateCallsign(callsignOverride);
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) throw new HttpError(500, 'Server is missing AVIATIONSTACK_API_KEY.');

  const result = await lookupAviationstack(flightNumber, callsign, { ...deps, apiKey });
  if (!result) {
    throw new HttpError(
      404,
      `Flight ${callsign || flightNumber} was not found in aviationstack data. This does not mean the flight is cancelled or does not exist.`
    );
  }
  return result;
}

module.exports = { HttpError, validateFlightNumber, validateCallsign, lookupFlight };

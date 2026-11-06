'use strict';

const { lookupFlight, HttpError } = require('../../lib/flight');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const result = await lookupFlight(req.query.flightNumber, req.query.callsign);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(err.status).json({ error: err.message, status: err.status });
    }
    console.error(err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Unexpected server error.', status: 500 });
  }
};

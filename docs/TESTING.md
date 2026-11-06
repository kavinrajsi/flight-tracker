# Testing checklist

## API
- [ ] `npm test` passes.
- [ ] `GET /api/flight/!!` → 400 with clear message.
- [ ] `GET /api/flight/ZZ1` (unmapped prefix) → 404, not 400.
- [ ] `GET /api/flight/AI302?callsign=bad!` → 400.
- [ ] Find a live callsign at <https://opensky-network.org/network/explorer>, call `/api/flight/<fn>?callsign=<cs>` → 200 with documented fields.
- [ ] Unmatched flight → 404, message does not imply cancellation.
- [ ] Non-GET → 405.
- [ ] Response has `Cache-Control: public, s-maxage=30, ...` on 200.

## Website
- [ ] Loads at `/`; input labelled; Enter submits.
- [ ] Loading state shown during fetch.
- [ ] Success card shows status, callsign, position, altitude, speed, heading, last contact.
- [ ] 404 shows "Not currently found in tracking data".
- [ ] 400/5xx and offline show red error.
- [ ] Mobile width (375px) no horizontal scroll; dark mode readable.

## iOS
- [ ] App + widget targets share App Group; `AppConfig.appGroup` matches.
- [ ] `apiBaseURL` points to deployed Vercel URL.
- [ ] Save flight → data shown; widget reloads (may be delayed by iOS).
- [ ] Widget with no saved flight → "No flight selected".
- [ ] Airplane mode → widget shows "Network unavailable".
- [ ] Small and medium widget layouts render.

## aviationstack
- [ ] Without `AVIATIONSTACK_API_KEY`: responses have `dataSource: "OpenSky Network"`.
- [ ] With key set: flight returns `dataSource: "aviationstack"` with `route` and `schedule`.
- [ ] Scheduled/cancelled flight returns that status and `position: null`.
- [ ] Bad key / quota exhausted: falls back to OpenSky; key appears in no response or log.

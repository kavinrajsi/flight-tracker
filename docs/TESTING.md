# Testing checklist

## API
- [ ] `npm test` passes.
- [ ] `GET /api/flight/!!` → 400 with clear message.
- [ ] `GET /api/flight/AI302?callsign=bad!` → 400.
- [ ] A real flight (e.g. one from flightradar24) → 200 with documented fields.
- [ ] Unmatched flight → 404, message does not imply cancellation.
- [ ] Non-GET → 405.
- [ ] Response has `Cache-Control: public, s-maxage=30, ...` on 200.

## Website
- [ ] Loads at `/`; input labelled; Enter submits.
- [ ] Loading state shown during fetch.
- [ ] Success card shows status, callsign, position, altitude, speed, heading, last contact.
- [ ] 404 shows "Flight not found".
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
- [ ] `AVIATIONSTACK_API_KEY` set in Vercel; `GET /api/flight/<real flight>` → `dataSource: "aviationstack"` with `route` and `schedule`.
- [ ] Key missing → 500 "missing AVIATIONSTACK_API_KEY" (no key leaked).
- [ ] Scheduled/cancelled flight returns that status and `position: null`.
- [ ] Bad key / quota exhausted → 502 generic message; key appears in no response or log.

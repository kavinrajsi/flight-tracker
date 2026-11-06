# Flight Tracker

Look up aircraft tracking data by flight number. Website + Vercel API (OpenSky Network) + SwiftUI iPhone app + WidgetKit Home Screen widget.

Repo: https://github.com/kavinrajsi/flight-tracker

## Important limitations

- **OpenSky is aircraft surveillance data, not an airline operations feed.** No schedules, delays, cancellations, gates or terminals.
- Flight number → callsign mapping is **not guaranteed**. Any airline prefix is searched: curated map in `lib/flight.js`, then ~900 codes bundled from OpenFlights (`lib/airlines.json`, regenerate with `node scripts/build-airlines.js`; data is ODbL, may be outdated), then the raw flight number as a fallback. Use `?callsign=` to override.
- A 404 means "not currently found in tracking data" — **never** that a flight is cancelled or nonexistent.
- Anonymous OpenSky access is rate limited and may change. Review OpenSky's terms/attribution before production use. For verified status, integrate an authorized provider (keep credentials server-side, in Vercel env vars; never commit them).
- WidgetKit refreshes are scheduled by iOS. The app can request a reload, but iOS may defer it for battery/system reasons. Widget requests ~15 min refresh; not guaranteed.

## Layout

```
api/flight/[flightNumber].js   Vercel function
lib/flight.js                  validation, mapping, OpenSky lookup
public/index.html              website
test/                          node:test unit tests
ios/Shared|App|Widget          Swift sources (no .xcodeproj)
docs/TESTING.md                checklist
```

## API

`GET /api/flight/:flightNumber[?callsign=AIC302]`

| Status | Meaning |
|---|---|
| 200 | Aircraft found |
| 400 | Invalid flight number/callsign |
| 404 | Not currently visible in OpenSky |
| 502 | Upstream error |
| 504 | Upstream timeout |
| 500 | Unexpected |

Illustrative 200 (not live data):

```json
{
  "flightNumber": "AI302",
  "callsign": "AIC302",
  "status": "airborne",
  "aircraft": { "icao24": "800123", "originCountry": "India" },
  "position": { "latitude": 13.0827, "longitude": 80.2707 },
  "altitudeMeters": 10500,
  "speedMetersPerSecond": 230,
  "headingDegrees": 145,
  "verticalRateMetersPerSecond": 0,
  "lastPositionUpdate": "2026-11-06T15:00:00.000Z",
  "lastContact": "2026-11-06T15:00:02.000Z",
  "dataSource": "OpenSky Network"
}
```

404 / 400 body: `{ "error": "...", "status": 404 }`.

Notes: the lookup fetches OpenSky `/states/all` and filters by callsign (OpenSky has no callsign filter). Responses send `Cache-Control: s-maxage=30` so Vercel's CDN absorbs repeat requests.

## Run & deploy

```bash
npm test
npx vercel dev          # local
```

Deploy: push to GitHub → import repo at vercel.com/new (no build command, framework "Other"). Static files in `public/` served at `/`; function at `/api/flight/:n`.

## iOS setup (Mac + Xcode)

1. New iOS App project (SwiftUI), e.g. `FlightTracker`. Delete generated `ContentView`/App files; add `ios/App/*.swift`.
2. File → New → Target → **Widget Extension** (uncheck Live Activity/Control/Configuration Intent). Delete generated widget files; add `ios/Widget/FlightWidget.swift`.
3. Add `ios/Shared/FlightShared.swift` to **both** targets (Target Membership).
4. Set bundle IDs and signing team on both targets.
5. Signing & Capabilities → **+ App Groups** on both targets, same group (e.g. `group.com.example.flighttracker`).
6. Edit `AppConfig` in `FlightShared.swift`: `appGroup` = your group, `apiBaseURL` = your Vercel URL.
7. Run app on device/simulator, save a flight, add the widget from the Home Screen.

## Testing

See [docs/TESTING.md](docs/TESTING.md).

# Flight Tracker

Look up aircraft tracking data by flight number. Website + Vercel API (aviationstack) + SwiftUI iPhone app + WidgetKit Home Screen widget.

Repo: https://github.com/kavinrajsi/flight-tracker

## Data provider

**aviationstack** (`AVIATIONSTACK_API_KEY`, required): route, schedule, delays, terminal/gate, status (`scheduled`/`airborne`/`landed`/`cancelled`/...) and live position when available. IATA numbers (`AI302`) are sent as `flight_iata`; ICAO flight codes (`AIC302`, or `?callsign=`) as `flight_icao`.

The free plan has a small monthly quota and **serves HTTP only**, so the key is sent unencrypted from Vercel to aviationstack. For HTTPS on a paid plan set `AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1`.

The key stays server-side. Never commit it.

```bash
vercel env add AVIATIONSTACK_API_KEY production   # also preview / development
vercel deploy --prod
# local: put AVIATIONSTACK_API_KEY=... in .env.local (git-ignored), then `vercel dev`
```

## Important limitations

- **Data comes from a third-party provider (aviationstack) and may be incomplete or delayed.** Live position is only present while a flight is airborne and tracked.
- A 404 means "not found in provider data" — **never** that a flight is cancelled or nonexistent.
- Quotas, plan limits and terms vary; review aviationstack's before production use. Keep credentials in Vercel env vars; never commit them.
- WidgetKit refreshes are scheduled by iOS. The app can request a reload, but iOS may defer it for battery/system reasons. Widget requests ~15 min refresh; not guaranteed.

## Layout

```
api/flight/[flightNumber].js   Vercel function
lib/flight.js                  validation + lookup orchestration
lib/aviationstack.js           aviationstack client + mapping
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
| 404 | Not found in aviationstack |
| 502 | Upstream error / quota exceeded |
| 504 | Upstream timeout |
| 500 | Unexpected, or API key not configured |

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
  "dataSource": "aviationstack"
}
```

404 / 400 body: `{ "error": "...", "status": 404 }`.

Responses send `Cache-Control: s-maxage=30` so Vercel's CDN absorbs repeat requests (helps the free quota).

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

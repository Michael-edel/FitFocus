# FitFocus iOS HealthKit bridge

This folder contains a minimal native iOS bridge that can:

- request HealthKit permissions
- read today's steps, active minutes, sleep hours, resting pulse, and weight
- send a normalized snapshot to `POST /api/wearable/sync`

## How auth works

The bridge can use a bearer token obtained from FitFocus:

- `POST /api/mobile/token` exchanges an existing web session for a token
- the token is sent as `Authorization: Bearer <token>`

## What to add in Xcode

Create a new iOS app target and add these files:

- `WearableSyncSnapshot.swift`
- `FitFocusWearableBridge.swift`

Then call:

1. `requestAccess()` once after the user grants consent
2. `syncNow(baseVersion:)` when the bridge should push data to FitFocus

## Example payload

```json
{
  "provider": "apple_health",
  "date": "2026-06-18T08:15:00.000+05:00",
  "metricsUpdatedAt": "2026-06-18T08:15:00.000+05:00",
  "stepsToday": 8421,
  "activeMinutesToday": 46,
  "sleepHoursLastNight": 7.2,
  "pulse": 61,
  "weight": 82.4,
  "sourceDevice": "iPhone 17 Pro Max",
  "sourceAppVersion": "1.0.0",
  "timezone": "Asia/Yekaterinburg",
  "baseVersion": 12
}
```


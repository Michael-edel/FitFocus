# FitFocus iOS HealthKit bridge

This folder contains a minimal native iOS bridge that can:

- request HealthKit permissions
- read today's steps, active minutes, sleep hours, resting pulse, and weight
- send a normalized snapshot to `POST /api/wearable/sync`
- keep the FitFocus base URL and mobile token on the device
- sync on button tap or by pulling down on the screen

## How auth works

The bridge can use a bearer token obtained from FitFocus:

- `POST /api/mobile/token` exchanges an existing web session for a token
- the token is sent as `Authorization: Bearer <token>`
- the app stores the token locally so you do not need to enter it again after relaunch

## What to add in Xcode

Create a new iOS app target and add these files:

- `WearableSyncSnapshot.swift`
- `FitFocusWearableBridge.swift`
- `ContentView.swift`
- `FitFocusWearableBridgeApp.swift`

The current app shell already provides:

- a token screen with persistent base URL and token inputs
- a `Request access` button for HealthKit
- a `Sync now` button
- pull-to-sync via the system refresh gesture

After setup:

1. Call `requestAccess()` once after the user grants consent
2. Call `syncNow(appVersion:)` when the bridge should push data to FitFocus
3. Pull down on the screen whenever you want to refresh the snapshot

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

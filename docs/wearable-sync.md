# FitFocus wearable sync contract

Endpoint: `POST /api/wearable/sync`

Purpose: accept a snapshot from an iPhone bridge, typically a small native app or helper that reads Apple HealthKit and forwards the data to FitFocus.

## Required transport

- Authenticated session cookie from FitFocus, or `Authorization: Bearer <token>` from `POST /api/mobile/token`
- `Content-Type: application/json`

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

## Field map

- `provider`: `apple_health`, `google_fit`, `fitbit`, `garmin`, or `manual`
- `date`: when the sample was recorded
- `metricsUpdatedAt`: when the bridge last refreshed the sample
- `stepsToday`: total steps for today
- `activeMinutesToday`: active or move minutes
- `sleepHoursLastNight`: last sleep duration in hours
- `pulse`: resting pulse in bpm
- `weight`: body weight in kg, optional
- `sourceDevice`: device label, optional
- `sourceAppVersion`: bridge version, optional
- `timezone`: Olson timezone, optional
- `baseVersion`: optimistic concurrency version from the profile

## Response

Success returns the updated profile and new version:

```json
{
  "profile": { },
  "updatedFields": ["wearableStepsToday", "wearableActiveMinutesToday"],
  "source": "apple_health",
  "version": 13
}
```

If the profile version changed on the server, the endpoint returns `409` with `PROFILE_CONFLICT` and the current server profile.

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

- `provider`: `apple_health`, `huawei_health`, `google_fit`, `fitbit`, `garmin`, or `manual`
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

## Huawei Health OAuth sync

Huawei Health uses server-side OAuth and does not expose tokens to the PWA.

Routes:

- `GET /api/wearable/huawei/status` - returns whether Huawei Health is configured and connected.
- `GET /api/wearable/huawei/start` - redirects the current logged-in user to Huawei OAuth.
- `GET /api/wearable/huawei/callback` - exchanges Huawei OAuth `code` for tokens and stores encrypted tokens in D1.
- `POST /api/wearable/huawei/sync` - refreshes the token if needed, reads today's Huawei Health snapshot, and writes supported metrics into the user profile.
- `POST /api/wearable/huawei/disconnect` - removes the Huawei connection and disables Huawei as current wearable source.

Required Cloudflare variables/secrets:

- `HUAWEI_HEALTH_CLIENT_ID`
- `HUAWEI_HEALTH_CLIENT_SECRET`
- `HUAWEI_HEALTH_SCOPES`
- `HUAWEI_HEALTH_REDIRECT_URI` when the callback differs from `<APP_URL>/api/wearable/huawei/callback`
- `HUAWEI_HEALTH_TOKEN_SECRET` optionally overrides token encryption key; otherwise `AUTH_JWT_SECRET` is used.

Optional provider/API overrides:

- `HUAWEI_HEALTH_AUTH_URL`
- `HUAWEI_HEALTH_TOKEN_URL`
- `HUAWEI_HEALTH_API_BASE_URL`
- `HUAWEI_HEALTH_STEPS_DATA_TYPE`
- `HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE`
- `HUAWEI_HEALTH_SLEEP_DATA_TYPE`
- `HUAWEI_HEALTH_PULSE_DATA_TYPE`

Current implementation reads Huawei Health data through `sampleSet:polymerize`. Steps use `com.huawei.continuous.steps.delta` by default. Other Huawei data types are intentionally environment-configurable because they depend on approved Huawei Health Kit scopes and available data classes for the app.

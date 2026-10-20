# FitFocus wearable sync contract

## Актуальное уточнение — обязательный proof для выдачи токена, `a1e79ac`, 15.10.2026

Follow-up [`a1e79ac`](https://github.com/Michael-edel/FitFocus/commit/a1e79ac85d1f77c2112d121fd21deb3da03a5fdc)
переводит `POST /api/mobile/token` на `requireScopedStateUser`: legacy-запрос без
proof получает 401 до чтения source-session и mint bearer-токена. Локально прошли
9 профильных mobile/beta tests, полный unit suite (1244/1244), три typecheck,
API/auth/admin/schema/privacy guards и production build. Точный CI follow-up
ожидает push; update старого Settings bundle и реальное устройство остаются
открытыми.

Endpoint: `POST /api/wearable/sync`

Purpose: accept a snapshot from an iPhone bridge, typically a small native app or helper that reads Apple HealthKit and forwards the data to FitFocus.

## Issuing a mobile bearer token

The user creates the bridge token from Settings with `POST /api/mobile/token`.
The current web client first refreshes the captured login proof through `/api/me`,
then sends `X-FitFocus-State-Account` and `X-FitFocus-State-Session` with the
POST. The server compares the pair to the cookie session before issuing a token.
Scoped responses include `X-FitFocus-Mobile-Token-Protocol: 1`,
`X-FitFocus-Mobile-Token-Guard: 1` and the echoed public scope; the response is
marked `Cache-Control: no-store`. The token-issuing POST is not retried.

Settings keeps the token only for the captured account/session guard, checks the
guard again before showing or copying it, and hides the token and setup link when
the login changes. Both scope headers are required; unscoped requests receive 401
before token minting. Older open web bundles must update before rollout.

The delayed token A → account B browser acceptance was expanded from desktop to
Android, Android PWA, iPhone Safari and iPhone PWA; the mobile extension passed
4/4 with retries disabled. Exact-head CI is checked after push; real-device and
staging verification remain open.

The same-account reauthentication acceptance also holds a token response from
the retired session until the account has signed in again with a new session ID.
The old token is neither displayed nor copied, while the new session's token
remains visible and is the only clipboard value. The scenario passed all seven
desktop/mobile/PWA profiles with retries disabled; exact-head CI is checked
after push. This uses a mock API and does not replace real-device or staging
verification.

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
The Settings flow is bound to its captured account/session proof. Current client,
server guard, OAuth-state binding, and account-switch acceptance are documented
in [Huawei session contract](huawei-health-session.md).

Routes:

- `GET /api/wearable/huawei/status` - returns whether Huawei Health is configured and connected.
- `POST /api/wearable/huawei/start` - checks the account/session scope and returns an authorization URL for the current Settings attempt.
- `GET /api/wearable/huawei/start` - preserves the legacy redirect flow; OAuth state is also bound to the initiating session.
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

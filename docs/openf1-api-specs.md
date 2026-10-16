# OpenF1 API usage

Base URL: `https://api.openf1.org/v1`. Historical data (2023 onwards) is free and needs no auth.
Client: `src/api/openf1.ts`. Queue: `src/api/queue.ts`.

## Limits and behaviour observed

| Behaviour | Handling |
| --- | --- |
| Free tier: 3 req/s **and** 30 req/min | `RequestQueue`: 400 ms between starts, ≤ 28 starts in any rolling 60 s, ≤ 2 in flight |
| `429 Too Many Requests` | Retried with exponential backoff (1 s, 2 s, 4 s …, honours `Retry-After`), up to 5 times, through the same limiter |
| `404 {"detail":"No results found."}` for empty queries | Resolved as `[]` |
| CORS | `access-control-allow-origin: *`; called directly from the browser |
| Date filters | `date>=…&date<=…` with ISO-8601 UTC (`Z`) timestamps |

## Endpoints

| Endpoint | Query | Used for | Cache key | TTL |
| --- | --- | --- | --- | --- |
| `/meetings` | `year` | GP picker | `meetings:{year}` | ∞ for past seasons, 15 min for current |
| `/sessions` | `meeting_key` or `session_key` | session picker, slot resolution | `sessions:{meeting}` / `session:{key}` | 1 h |
| `/drivers` | `session_key` | driver picker, team colours | `drivers:{session}` | ∞ once session ended > 3 days ago |
| `/laps` | `session_key`[, `driver_number`] | lap list, fastest lap, replay lap counter | `laps:{session}:{driver\|all}` | as above |
| `/stints` | `session_key`[, `driver_number`] | compound per lap | `stints:{session}:{driver\|all}` | as above |
| `/car_data` | `session_key, driver_number, date>=start−1.5s, date<=end+1.5s` | lap telemetry | `{session}:{driver}:{lap}` | ∞ |
| `/location` | same window as `car_data` | lap racing line | stored with `car_data` | ∞ |
| `/location` | `session_key, date>=T, date<T+240s` (all drivers) | replay chunk | `replay-location:{session}:{T}` | as metadata |
| `/position` | `session_key` | replay order | `position:{session}` | as metadata |
| `/intervals` | `session_key` | replay gaps (one request per session) | `intervals:{session}` | as metadata |
| `/pit` | `session_key` | replay pit status | `pit:{session}` | as metadata |

`car_data` and `location` are never requested without both a driver and a lap-bounded date window.

## Cache layers

1. In-memory LRU (256 entries) in `OpenF1Client`.
2. IndexedDB database `f1-telemetry-pro`, store `responses`, entries `{ key, storedAt, value }`.
3. Network via the queue. Identical in-flight URLs share one request.

## Field quirks

- `brake` is either 0/100 or 0–100; normalised to [0, 1] (`normaliseBrake`).
- `throttle` occasionally exceeds 100 (e.g. 104); clamped to [0, 100].
- `drs`: 10, 12, 14 = flap open; 0, 1, 8 = closed/eligible.
- `location` `x, y` are in decimetres; (0, 0) appears for cars in the garage and is filtered out of replay tracks.
- `intervals.gap_to_leader` may be a string such as `"+1 LAP"`.
- `laps.lap_duration` is `null` for the lap in progress at session end and for some deleted laps; such laps are skipped.

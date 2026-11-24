# ADR 0002: HTTP monitoring on GitDB with stateless workers

- Status: Accepted
- Date: 2026-11-23

## Context

Projects need UptimeRobot-style HTTP monitors: a URL, a method and headers checked every 60 s,
up/degraded/down status, uptime percentages and status bars, linked to Code Report services (a
service has any number of monitors). Checks must be able to run on many workers, possibly in other
services or regions.

Constraints: GitDB is the only persistence layer and we do not add a database. Every GitDB write
re-serializes the whole table (chunked past 20 MiB), keeps it in memory, and becomes part of a Git
history that never shrinks.

## Decision

### Storage: aggregates, never one row per check

One row per check (1 440 a day per monitor) would make a 100-monitor table about 860 MB after
30 days, rewritten on every flush and kept forever in Git. Instead:

| Table                   | Content                                                                  | Written                                |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `monitors` (main GitDB) | configuration; header values and body AES-256-GCM encrypted              | on edit                                |
| `monitoring_incidents`  | each period down or degraded, with cause                                 | at once, on status change              |
| `monitoring_current`    | the hour in progress, one row per monitor                                | every `MONITORING_FLUSH_SECONDS` (300) |
| `monitoring_hourly`     | closed hours: counts, latency avg/p95/max                                | when the hour closes                   |
| `monitoring_daily`      | hours older than `MONITORING_HOURLY_RETENTION_DAYS` (30), merged per day | hourly compaction                      |

The raw checks only live in memory (last 120 per monitor). 100 monitors take about 11 MB of hourly
rows, 5 MB of daily rows a year, and ~12 commits an hour regardless of the number of checks (GitDB
folds writes made close together into one commit).

Uptime is **time-based from incidents** (`1 - down time / monitored time`), so it is exact for any
window and survives compaction. Degraded time counts as up but is painted amber. Neither uptime nor
the live status is written to `monitors`: that table stays configuration and its audit history stays
meaningful. On restart the status is rebuilt from the open incidents and `monitoring_current`.

The metrics tables can live in a **dedicated GitDB repository** (`MONITORING_GITDB_REPOSITORY_URL`)
so the main history stays clean and the metrics one can be squashed or recreated. Without it they
share the main repository and the audit views skip `monitoring_*`.

### Scheduling: pull-based leases, stateless workers

The server process (already the single GitDB writer) owns an in-memory schedule:

```
worker ──POST /api/internal/monitoring/lease {capacity}──▶ scheduler: due checks, one lease each
worker ── runs the HTTP checks (bounded concurrency)
worker ──POST /api/internal/monitoring/results [...]────▶ runtime: status, counters, incidents
```

- Each monitor has a stable, uniform offset in its interval (SHA-1 of the id), so checks spread
  over the minute instead of all firing at :00.
- A lease expires after `timeout + 15 s`; another worker then gets the same slot (two attempts at
  most). Results are accepted once and only for the live lease, so a slow worker can't record a
  check twice.
- Workers need no database or GitDB access: only `MONITORING_API_URL` and the shared
  `MONITORING_WORKER_TOKEN` (constant-time comparison, optional `MONITORING_INTERNAL_HOSTS`
  allowlist so the API is only served on the private hostname). Scaling is adding replicas.
- An embedded worker (same code, direct calls instead of HTTP) runs in the server by default.

Alternatives rejected: a push scheduler (it must know and track the workers), a queue or Redis
(new infrastructure), every worker reading GitDB (many writers on a Git repository).

### Status and events

A monitor goes down or degraded after `confirmations` failing checks in a row (default 2); the
incident starts at the first of them. The first good check closes it. Each transition publishes
`monitoring.monitor.down`, `.degraded` or `.recovered` (project scope, `readPermission`
`project:monitoring:monitors:read`) with a display URL without credentials or query string, so
the alert engine emails people with no extra code.

### Security

Monitors run requests from inside the platform network, so they are an SSRF vector. The address the
socket connects to is checked in the DNS `lookup` hook (loopback, RFC 1918, link-local and cloud
metadata, CGNAT, multicast, reserved, IPv4-mapped IPv6), covering hostnames that resolve to private
addresses, DNS rebinding and redirects. `MONITORING_ALLOW_PRIVATE_TARGETS=true` lifts it. Credential
headers are dropped on cross-origin redirects; errors never contain the URL or header values.

## Consequences

- A crash loses the recent checks and up to one flush of hourly counters; downtime is never lost.
- The schedule lives in the single server process. This matches GitDB's single-writer model; a
  multi-replica API would need a shared lease store first.
- p95 values merged from hours into days are weighted approximations.

# Observability Reference

## Sentry Configuration

| Env var | Default | Description |
|---|---|---|
| `SENTRY_DSN` | `""` | Sentry Data Source Name. Leave empty to disable Sentry entirely. |
| `SENTRY_ENV` | `"production"` | Environment tag (`production`, `staging`, `dev`). |
| `SENTRY_TRACES_PROFILE` | `false` | Set to `true` to enable Sentry profiling. Takes effect on next restart. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Unused. Formerly the global sample rate; superseded by the per-route `traces_sampler`. The value is not passed to the SDK — safe to remove from env files. |
| `SENTRY_RELEASE` | `""` | Override release identifier. Falls back to `GIT_SHA`, `SOURCE_VERSION`, `GIT_COMMIT` env vars, then `git rev-parse HEAD`. |

## Sampling Rules

Per-route sampling is controlled by `traces_sampler` in `backend/app/core/observability.py`:

| Route pattern | `traces_sample_rate` | Reason |
|---|---|---|
| `/healthz`, `/readyz` | `0.0` | High-frequency health checks — no value in tracing them |
| `/api/dte/*` | `0.5` | DTE (SII) calls are business-critical; sample half |
| `/api/lioren/*` | `0.5` | Lioren webhook/API calls; same priority as DTE |
| Everything else | `0.05` | Default 5% sampling to keep volume manageable |

## Transaction Names

The FastAPI + Starlette Sentry integrations (v1.x+) automatically set transaction names to route templates (e.g. `GET /api/invoices/{id}`) instead of literal paths. No additional configuration is required.

## Tagging `empresa_id`

To associate a Sentry transaction with a specific empresa, call `sentry_sdk.set_tag` from within the request context — for example in a FastAPI dependency or middleware:

```python
import sentry_sdk

# In a dependency or route handler where `empresa` is resolved:
sentry_sdk.set_tag("empresa_id", str(empresa.id))
```

This is already implemented in `get_current_user` (`backend/app/api/auth.py`) — every authenticated request is automatically tagged.

## Suggested Sentry Dashboards

Create these dashboards manually in the Sentry UI under **Dashboards → Create Dashboard**:

| Dashboard | Widget type | Query / Metric |
|---|---|---|
| Slowest endpoints | Table | `event.type:transaction` grouped by `transaction`, sorted by `p95(transaction.duration)` desc |
| Throughput per route | Bar chart | `event.type:transaction` grouped by `transaction`, metric `count()` |
| Error rate | Percentage line | `failure_rate()` over time, grouped by `transaction` |
| p95 trends | Line chart | `p95(transaction.duration)` over time, grouped by `transaction` |

## Suggested Sentry Alerts

| Alert | Condition | Window |
|---|---|---|
| Error rate spike | `failure_rate() > 0.05` (>5%) | 5 minutes |
| p95 regression | `p95(transaction.duration) > 500ms` sustained | 10 minutes |

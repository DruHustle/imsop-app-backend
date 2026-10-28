# Optional forecast provider contract (implemented adapter)

Exception review works without a model. A server adapter and scoped UI are implemented. An external account is not provisioned. Predictions require configured provider settings and actual source observations.

The server-only adapter validates this contract:

```json
{
  "contractVersion": 1,
  "requestId": "opaque-idempotency-key",
  "workspaceId": "server-resolved-workspace-uuid",
  "datasetSnapshotAt": "2026-10-27T09:00:00Z",
  "observationStart": "2026-09-01T00:00:00Z",
  "observationEnd": "2026-10-27T00:00:00Z",
  "horizonDays": 7,
  "bucket": "day",
  "series": [{"sku": "source-qualified-product", "date": "2026-10-26", "quantity": 12, "unit": "items"}]
}
```

Workspace and source/product associations must come from authorized server data. Horizon must be bounded (1–90 days), observations may not extend beyond snapshot time, quantities must be finite/nonnegative with explicit units, and incomplete history must be reported rather than invented.

```json
{
  "contractVersion": 1,
  "requestId": "opaque-idempotency-key",
  "provider": "configured-provider-alias",
  "modelVersion": "provider-reported-version",
  "generatedAt": "2026-10-27T09:00:01Z",
  "sourceSnapshotAt": "2026-10-27T09:00:00Z",
  "predictions": [{"sku": "source-qualified-product", "date": "2026-10-28", "quantity": 11, "unit": "items"}],
  "limitations": ["provider-supplied data limitation"]
}
```

Response identity, snapshot, horizon, product set and units must match the request. Missing provider/model/source/time evidence makes the response unavailable. Confidence, accuracy, savings or financial impact may be shown only with separately supplied validated evidence, never inferred from an icon or a point prediction. No response may execute inventory, booking, purchase or infrastructure actions.

Configuration requires explicit `FORECAST_ENABLED=true`; the default is disabled even if an endpoint is present. Set `FORECAST_PROVIDER_URL` (administrator-selected HTTPS endpoint without URL credentials/query parameters; redirects rejected), `FORECAST_PROVIDER_NAME` (expected response alias), optional `FORECAST_PROVIDER_TOKEN_FILE` (absolute server-side secret-store reference) or the existing inline `FORECAST_PROVIDER_TOKEN`, and `FORECAST_MAX_HORIZON_DAYS` (1–90, default 30). Ambiguous credential sources are rejected. Requests time out after ten seconds; responses are capped at 1 MiB. HTTP loopback/sink is allowed only with NODE_ENV=test. No URL or credential comes from a caller. See [activation requirements](../OPTIONAL_INTEGRATIONS.md).

`POST /api/operations/forecasts/observations` accepts `{observations:[{sku,date,quantity,unit,source}]}` from admin/engineer members. It validates distinct historical SKU/date rows, finite nonnegative quantities with up to four decimal places and explicit source/units, committing the upload atomically. Matching SKU/date uploads explicitly correct existing observations. `POST /api/operations/forecasts` accepts `{horizonDays}` from admin/engineer/analyst. The last year is bounded to 10,000 observations and 100 products; mixed units are rejected. Every product/day/unit and the request/provider/snapshot identity must match. Invalid/partial responses return 502 and are not saved. `GET /api/operations/forecasts` exposes only the current workspace's counts and five latest persisted responses. No cross-workspace response can be requested by caller-supplied IDs.

The contract double in system qualification returns labelled synthetic responses solely to verify transport/validation. It establishes no forecast accuracy or model capability. Production still needs a real authorized provider and source data.

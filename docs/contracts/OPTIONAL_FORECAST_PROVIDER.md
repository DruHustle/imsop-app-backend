# Optional forecast provider contract (reserved, not implemented)

Exception review works without a model. No forecast adapter or external account is activated by this release. The UI deliberately stays unavailable until an adapter, evidence coverage and a provider have been qualified. Setting a URL alone does not enable forecasts.

A future server-only adapter must validate a contract such as:

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

Reserved configuration for a future adapter: `FORECAST_PROVIDER_URL` (HTTPS allowlisted destination), `FORECAST_PROVIDER_CREDENTIAL_REF` (existing server secret mechanism), `FORECAST_TIMEOUT_MS` (bounded 1,000–10,000), and `FORECAST_MAX_HORIZON_DAYS` (1–90). These settings are not read by the current code and do not connect an account. They describe a future implementation contract, not an implemented endpoint. No paid subscription is required or provisioned.

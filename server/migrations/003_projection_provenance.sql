ALTER TABLE shipments ADD COLUMN projection_provenance jsonb;
-- Original promise is immutable once established; legacy rows stay unknown.

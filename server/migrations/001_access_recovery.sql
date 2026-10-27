-- Existing operational rows intentionally remain unassigned. Provision only from reviewed evidence.
CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL, dotnet_organization_id uuid UNIQUE);
CREATE TABLE workspace_memberships (
  user_id integer NOT NULL REFERENCES users(id), workspace_id uuid NOT NULL REFERENCES workspaces(id),
  PRIMARY KEY(user_id, workspace_id)
);
ALTER TABLE users ADD COLUMN active_workspace_id uuid REFERENCES workspaces(id),
  ADD COLUMN session_version integer NOT NULL DEFAULT 0,
  ADD COLUMN disabled boolean NOT NULL DEFAULT false;
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), workspace_id uuid REFERENCES workspaces(id),
  version integer NOT NULL, role varchar(50) NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE FUNCTION revoke_account_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled IS DISTINCT FROM OLD.disabled OR NEW.active_workspace_id IS DISTINCT FROM OLD.active_workspace_id THEN
   NEW.session_version := OLD.session_version + 1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_session_changes BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION revoke_account_sessions();
ALTER TABLE shipments ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE orders ADD COLUMN workspace_id uuid REFERENCES workspaces(id), ADD COLUMN currency varchar(3),
 ADD CONSTRAINT orders_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
ALTER TABLE telemetry ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE logistics_events ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
CREATE TABLE logistics_connectors (
 provider varchar(100) PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id),
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE reset_deliveries (
 id uuid PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), reset_version integer NOT NULL,
 encrypted_payload text, state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 UNIQUE(user_id, reset_version)
);
CREATE INDEX reset_delivery_due ON reset_deliveries(state,next_attempt_at);
CREATE INDEX shipments_workspace_id ON shipments(workspace_id,id DESC);
CREATE INDEX orders_workspace_id ON orders(workspace_id,id DESC);
CREATE INDEX telemetry_workspace_time ON telemetry(workspace_id,timestamp DESC,id DESC);

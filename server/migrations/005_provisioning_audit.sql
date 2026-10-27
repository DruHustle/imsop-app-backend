-- Provisioning remains a separate operator action; this records no inferred assignments.
CREATE TABLE provisioning_runs (
 plan_hash text PRIMARY KEY CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
 operator_name text NOT NULL, database_role text NOT NULL DEFAULT current_user,
 source_evidence text NOT NULL, reviewed_plan jsonb NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now()
);

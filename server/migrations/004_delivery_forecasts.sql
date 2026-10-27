CREATE TABLE notification_preferences (
 user_id integer NOT NULL REFERENCES users(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 email_enabled boolean NOT NULL DEFAULT false,PRIMARY KEY(user_id,workspace_id));
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id integer NOT NULL REFERENCES users(id),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),action_id integer NOT NULL REFERENCES review_actions(id),
 state text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,UNIQUE(user_id,action_id));
CREATE INDEX notification_delivery_due ON notification_deliveries(state,next_attempt_at);
CREATE FUNCTION enqueue_review_email() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO notification_deliveries(user_id,workspace_id,action_id)
 SELECT p.user_id,NEW.workspace_id,NEW.id FROM notification_preferences p
 JOIN workspace_memberships m ON m.user_id=p.user_id AND m.workspace_id=p.workspace_id
 JOIN users u ON u.id=p.user_id AND NOT u.disabled AND u.active_workspace_id=p.workspace_id
 WHERE p.workspace_id=NEW.workspace_id AND p.email_enabled ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER review_email_queue AFTER INSERT ON review_actions FOR EACH ROW EXECUTE FUNCTION enqueue_review_email();
CREATE TABLE forecast_observations (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),sku varchar(100) NOT NULL,day date NOT NULL,
 quantity numeric(20,4) NOT NULL CHECK(quantity>=0),unit varchar(30) NOT NULL,source varchar(200) NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,sku,day));
CREATE TABLE forecast_runs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),provider varchar(100) NOT NULL,
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX forecast_runs_scope ON forecast_runs(workspace_id,created_at DESC);

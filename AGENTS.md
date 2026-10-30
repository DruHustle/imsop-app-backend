# IMSOP deployment image retention

After every successful Docker image deployment, remove older unused IMSOP images
on the deployment host, including local development and Oracle production.
Retain the current images and one previously verified, compatible rollback per
service. Rehearse schema/access compatibility before choosing a production
rollback. Preserve images referenced by any running or stopped container.

Use `scripts/deploy_compose.py` and the commands in
`deploy/oracle/README.md` for Compose deployments. It records previous image IDs,
waits for readiness and verifies the production revision before cleanup. If a
separately qualified release tool performs promotion, run
`scripts/image_retention.py --keep CURRENT --keep ROLLBACK --apply` only after its
verification succeeds, using the same `.deployment.lock`. Update the host's
`.image-retention.json` policy when the verified current/rollback pair changes.

Scope deletion to IMSOP images. Never force deletion, globally prune unrelated
projects, remove containers/volumes/database data, or discard a rollback before
the replacement release passes verification. A cleanup failure must be reported;
do not bypass protection. Keep deployment secrets and retention state untracked.

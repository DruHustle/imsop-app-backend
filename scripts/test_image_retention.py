"""Destructive-operation boundaries exercised with isolated Docker doubles."""
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import deploy_compose
import image_retention as retention


def image(identity, refs=None, title=None):
    return {"Id": identity, "RepoTags": refs or [], "RepoDigests": [], "Size": 123,
            "Config": {"Labels": {"org.opencontainers.image.title": title} if title else {}}}


CURRENT = image("sha256:current", ["imsop-app-backend:current"])
OLD = image("sha256:old", ["imsop-app-backend:old"])


class RetentionTests(unittest.TestCase):
    def run_cleanup(self, images, containers=None, apply=True, fresh=None, docker_error=None):
        def inspect(ref):
            if ref == CURRENT["Id"]:
                return CURRENT
            return (fresh or {}).get(ref, next(row for row in images if row["Id"] == ref))
        with patch.object(retention, "inspect_image", side_effect=inspect), \
             patch.object(retention, "inventory", return_value=images), \
             patch.object(retention, "container_images", side_effect=containers or [{}, {}]), \
             patch.object(retention, "docker", side_effect=docker_error, return_value="") as docker:
            result = retention.cleanup([CURRENT["Id"]], apply)
            return result, docker.call_args_list

    def test_current_and_stopped_container_images_are_protected(self):
        rows = [CURRENT, OLD]
        result, calls = self.run_cleanup(rows, [{"stopped": {"image": OLD["Id"]}}])
        self.assertEqual(len(result["retained"]), 2)
        self.assertEqual(calls, [])

    def test_disappearing_container_retries_a_complete_snapshot(self):
        with patch.object(retention, "docker", side_effect=["gone", RuntimeError("removed"), "present", "present sha256:used local:tag \n"]) as docker:
            result = retention.container_images()
        self.assertEqual(result, {"present": {"image": "sha256:used", "reference": "local:tag", "service": ""}})
        self.assertEqual(docker.call_count, 4)

    def test_persistent_snapshot_failure_stops_without_partial_protection(self):
        with patch.object(retention, "docker", side_effect=["gone", RuntimeError("removed")] * 3) as docker:
            with self.assertRaises(RuntimeError):
                retention.container_images()
        self.assertEqual(docker.call_count, 6)

    def test_dry_run_never_removes_images(self):
        result, calls = self.run_cleanup([OLD], apply=False)
        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["removed"], [])
        self.assertEqual(calls, [])

    def test_container_reference_protects_platform_manifest_and_default_tag_alias(self):
        manifest = image("sha256:index", ["imsop-app-backend:latest"])
        result, calls = self.run_cleanup([manifest], [{"running": {"image": "sha256:platform", "reference": "imsop-app-backend"}}])
        self.assertEqual(len(result["retained"]), 1)
        self.assertEqual(calls, [])

    def test_unused_image_removed_by_immutable_id_without_force_or_parent_prune(self):
        result, calls = self.run_cleanup([OLD])
        self.assertEqual(result["removed"], result["candidates"])
        self.assertEqual(calls[0].args, ("image", "rm", "--no-prune", OLD["Id"]))

    def test_unknown_and_other_project_aliases_are_protected(self):
        unrelated = image("sha256:other", ["other-project:old"], "IMSOP backend")
        shared = image("sha256:shared", ["imsop-app-backend:old", "other-project:rollback"])
        unknown = image("sha256:unknown")
        result, calls = self.run_cleanup([unrelated, shared, unknown])
        self.assertEqual(len(result["retained"]), 3)
        self.assertEqual(calls, [])

    def test_new_container_reference_between_plan_and_delete_prevents_removal(self):
        result, calls = self.run_cleanup([OLD], [{}, {"new": {"image": OLD["Id"]}}])
        self.assertEqual(len(result["skipped"]), 1)
        self.assertEqual(calls, [])

    def test_new_unrelated_alias_between_plan_and_delete_prevents_removal(self):
        shared = image(OLD["Id"], ["imsop-app-backend:old", "other-project:new"])
        result, calls = self.run_cleanup([OLD], fresh={OLD["Id"]: shared})
        self.assertEqual(len(result["skipped"]), 1)
        self.assertEqual(calls, [])

    def test_docker_refusal_never_retries_with_force(self):
        result, calls = self.run_cleanup([OLD], docker_error=RuntimeError("in use"))
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["removed"], [])
        self.assertEqual(len(calls), 1)

    def test_timeout_stops_further_deletions_and_reports_uncertain_result(self):
        another = image("sha256:another", ["imsop-app-backend:another"])
        result, calls = self.run_cleanup([OLD, another], docker_error=subprocess.TimeoutExpired("docker", 120))
        self.assertEqual(len(result["errors"]), 1)
        self.assertIn("timed out", result["errors"][0]["reason"])
        self.assertEqual(result["removed"], [])
        self.assertEqual(len(calls), 1)

    def test_missing_rollback_aborts_before_inventory_or_deletion(self):
        with patch.object(retention, "inspect_image", side_effect=RuntimeError("missing")), \
             patch.object(retention, "inventory") as inventory, patch.object(retention, "docker") as docker:
            with self.assertRaises(RuntimeError):
                retention.cleanup(["missing"], True)
            inventory.assert_not_called()
            docker.assert_not_called()

    def test_dangling_image_needs_explicit_imsop_title(self):
        owned = image("sha256:dangling", title="IMSOP backend")
        result, calls = self.run_cleanup([owned])
        self.assertEqual(len(result["removed"]), 1)
        self.assertEqual(len(calls), 1)

    def test_previous_service_image_becomes_rollback_only_when_changed(self):
        result = deploy_compose.retained_services(
            {"app": "old", "node": "same"}, {"app": "new", "node": "same"},
            {"app": {"rollback": "older"}, "node": {"rollback": "node-rollback"}})
        self.assertEqual(result["app"], {"current": "new", "rollback": "old"})
        self.assertEqual(result["node"]["rollback"], "node-rollback")

    def test_failed_readiness_leaves_policy_and_images_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            state = root / ".image-retention.json"
            state.write_text(json.dumps({"services": {"app": {"current": "old", "rollback": "older"}}}))
            original = state.read_bytes()
            with patch("sys.argv", ["deploy_compose.py", "--project-directory", folder,
                                   "--file", "compose.yaml", "--origin", "http://127.0.0.1:8080"]), \
                 patch.object(deploy_compose, "container_images", return_value={}), \
                 patch.object(deploy_compose.subprocess, "run"), \
                 patch.object(deploy_compose, "verify", side_effect=RuntimeError("not ready")), \
                 patch.object(deploy_compose, "cleanup") as cleanup:
                with self.assertRaises(RuntimeError):
                    deploy_compose.main()
                cleanup.assert_not_called()
                self.assertEqual(state.read_bytes(), original)

    def test_successful_deployment_records_previous_image_then_cleans_up(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            state = root / ".image-retention.json"
            state.write_text(json.dumps({"services": {"app": {"current": OLD["Id"], "rollback": "older"}}}))
            snapshots = [{"container": {"image": OLD["Id"], "service": "app"}},
                         {"container": {"image": CURRENT["Id"], "service": "app"}}]
            def inspect(ref):
                return CURRENT if ref == CURRENT["Id"] else OLD
            with patch("sys.argv", ["deploy_compose.py", "--project-directory", folder, "--file", "compose.yaml",
                                   "--origin", "http://127.0.0.1:11001", "--expect-revision", "a" * 40, "--service", "app"]), \
                 patch.object(deploy_compose, "container_images", side_effect=snapshots), \
                 patch.object(deploy_compose, "inspect_image", side_effect=inspect), \
                 patch.object(deploy_compose.subprocess, "run") as run, \
                 patch.object(deploy_compose, "verify") as verify, \
                 patch("builtins.print"), \
                 patch.object(deploy_compose, "cleanup", return_value={"errors": []}) as cleanup:
                deploy_compose.main()
                verify.assert_called_once_with("http://127.0.0.1:11001", "a" * 40)
                self.assertEqual(run.call_args.args[0][-2:], ["--no-deps", "app"])
                cleanup.assert_called_once_with(sorted([CURRENT["Id"], OLD["Id"]]), apply=True)
                self.assertEqual(json.loads(state.read_text())["services"]["app"],
                                 {"current": CURRENT["Id"], "rollback": OLD["Id"]})


if __name__ == "__main__":
    unittest.main()

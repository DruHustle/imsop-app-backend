#!/usr/bin/env python3
"""Compose deployment with image cleanup only after verified readiness."""
import argparse
import fcntl
import json
import os
import pathlib
import re
import subprocess
import time
import urllib.request

from image_retention import cleanup, container_images, inspect_image, ownership


def verify(url, revision):
    base = url.rstrip("/")
    with urllib.request.urlopen(base + "/ready", timeout=10) as response:
        if json.load(response).get("status") != "ready":
            raise RuntimeError("Deployment is not ready; image cleanup skipped")
    with urllib.request.urlopen(base + "/version", timeout=10) as response:
        version = json.load(response)
    if version.get("apiContract") != 2 or (revision and version.get("revision") != revision):
        raise RuntimeError("Release identity mismatch; image cleanup skipped")


def retained_services(before, after, previous):
    result = {}
    for service, image in after.items():
        old = before.get(service)
        rollback = old if old and old != image else previous.get(service, {}).get("rollback")
        result[service] = {"current": image, "rollback": rollback}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-directory", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument("--project-name", default="imsop-app-backend")
    parser.add_argument("--file", action="append", required=True)
    parser.add_argument("--origin", required=True, help="Gateway origin for /ready and /version checks")
    parser.add_argument("--expect-revision", help="Mandatory exact SHA for Oracle production")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--service", action="append", default=[])
    args = parser.parse_args()
    root = args.project_directory.resolve()
    if args.expect_revision and not re.fullmatch(r"[a-f0-9]{40}", args.expect_revision):
        parser.error("--expect-revision must be an exact SHA")
    if args.project_name != "imsop-app-backend":
        parser.error("This deployment helper manages only imsop-app-backend")
    if args.origin.rstrip("/") != "http://127.0.0.1:8080" and not args.expect_revision:
        parser.error("An exact revision is required outside the local development gateway")
    with (root / ".deployment.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_path = root / ".image-retention.json"
        previous = json.loads(state_path.read_text()).get("services", {}) if state_path.exists() else {}

        def managed():
            result = {}
            for row in container_images(args.project_name).values():
                if row["service"] and ownership(inspect_image(row["image"])):
                    if row["service"] in result:
                        raise RuntimeError("Ambiguous service replicas; cleanup skipped")
                    result[row["service"]] = row["image"]
            return result

        before = managed()
        command = ["docker", "compose", "--project-directory", str(root), "--project-name", args.project_name]
        for file in args.file:
            command += ["-f", str((root / file).resolve())]
        command += ["up", "--detach", "--wait", "--wait-timeout", "120"]
        if args.build:
            command.append("--build")
        if args.service:
            command += ["--no-deps", *args.service]
        subprocess.run(command, check=True)
        verify(args.origin, args.expect_revision)
        services = retained_services(before, managed(), previous)
        keep = sorted({identity for row in services.values() for identity in row.values() if identity})
        if not keep:
            raise RuntimeError("No managed images found; cleanup skipped")
        # Verify rollback availability before replacing the policy or deleting.
        for identity in keep:
            inspect_image(identity)
        temp = state_path.with_suffix(".tmp")
        temp.write_text(json.dumps({"services": services, "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, indent=2) + "\n")
        temp.chmod(0o600)
        os.replace(temp, state_path)
        result = cleanup(keep, apply=True)
        print(json.dumps(result, indent=2))
        if result["errors"]:
            raise RuntimeError("Deployment is ready; some unused images could not be removed (see report)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Remove only unused IMSOP images; default to a reviewable dry run."""
import argparse
import fcntl
import json
import pathlib
import subprocess
import sys

REPOSITORIES = {
    "imsop-app-backend", "imsop-backend", "imsop-remediation",
    "imsop-gateway", "imsop-node-api", "imsop-operationsservice",
    "imsop-supplychainservice", "imsop-supply-chain",
    "imsop-app-backend-server", "imsop-app-backend-gateway",
    "imsop-app-backend-operations-service", "imsop-app-backend-supply-chain-service",
    *["ghcr.io/druhustle/" + name for name in (
        "imsop-backend", "imsop-gateway", "imsop-node-api",
        "imsop-operationsservice", "imsop-supplychainservice")],
}


def docker(*args):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=120)
    if result.returncode:
        # Do not echo Docker inspect/config output or application environment.
        raise RuntimeError("Docker operation failed: " + " ".join(args[:2]))
    return result.stdout


def inspect_image(ref):
    return json.loads(docker("image", "inspect", ref))[0]


def repository(ref):
    return ref.split("@", 1)[0].rsplit(":", 1)[0] if "@" not in ref else ref.split("@", 1)[0]


def canonical_ref(ref):
    return ref + ":latest" if ref and "@" not in ref and ":" not in ref.rsplit("/", 1)[-1] else ref


def is_used(image, containers):
    aliases = {canonical_ref(ref) for ref in (image.get("RepoTags") or []) + (image.get("RepoDigests") or [])}
    return any(row["image"] == image["Id"] or canonical_ref(row.get("reference", "")) in aliases
               for row in containers.values())


def ownership(image):
    refs = set((image.get("RepoTags") or []) + (image.get("RepoDigests") or []))
    refs.discard("<none>:<none>")
    labels = image.get("Config", {}).get("Labels") or {}
    if refs:
        # A shared image tagged by another project must stay intact.
        return all(repository(ref) in REPOSITORIES for ref in refs)
    return labels.get("org.opencontainers.image.title") == "IMSOP backend"


def container_images(project=None):
    args = ["container", "ls", "--all", "--quiet"]
    if project:
        args += ["--filter", "label=com.docker.compose.project=" + project]
    ids = docker(*args).split()
    if not ids:
        return {}
    # Request only identities and Compose service labels, never environments.
    rows = docker("container", "inspect", "--format",
                  '{{.Id}} {{.Image}} {{.Config.Image}} {{index .Config.Labels "com.docker.compose.service"}}', *ids)
    images = {}
    for line in rows.splitlines():
        value = line.split(maxsplit=3)
        service = value[3] if len(value) > 3 and value[3] != "<no value>" else ""
        images[value[0]] = {"image": value[1], "reference": value[2], "service": service}
    return images


def inventory():
    ids = set()
    for selector in ("reference=*imsop*", "label=org.opencontainers.image.title=IMSOP backend"):
        ids.update(docker("image", "ls", "--all", "--quiet", "--no-trunc", "--filter", selector).split())
    return json.loads(docker("image", "inspect", *sorted(ids))) if ids else []


def cleanup(keep, apply=False):
    if not keep:
        raise ValueError("Explicit current/rollback image references are required")
    protected = set()
    for ref in keep:
        image = inspect_image(ref)  # Missing rollback aborts before any deletion.
        if not ownership(image):
            raise ValueError("Retained image is not exclusively owned by IMSOP")
        protected.add(image["Id"])
    used = container_images()
    report = {"apply": apply, "retained": [], "candidates": [], "removed": [], "skipped": [], "errors": []}
    for image in inventory():
        identity = image["Id"]
        row = {"id": identity, "references": sorted(set((image.get("RepoTags") or []) + (image.get("RepoDigests") or []))),
               "logicalBytes": image.get("Size", 0)}
        reason = ("shared or unknown ownership" if not ownership(image) else
                  "explicit current/rollback" if identity in protected else
                  "referenced by a container" if is_used(image, used) else None)
        if reason:
            report["retained"].append({**row, "reason": reason})
            continue
        report["candidates"].append(row)
        if not apply:
            continue
        # Refresh protection immediately before deletion. Immutable IDs prevent a
        # mutable tag moving to a newer build between inspection and removal.
        try:
            fresh = inspect_image(identity)
            used_now = container_images()
        except (RuntimeError, subprocess.TimeoutExpired):
            report["errors"].append({**row, "reason": "Protection could not be revalidated; further cleanup stopped"})
            break
        if is_used(fresh, used_now) or not ownership(fresh):
            report["skipped"].append({**row, "reason": "ownership or container references changed"})
            continue
        try:
            docker("image", "rm", "--no-prune", identity)
            report["removed"].append(row)
        except RuntimeError:
            # No --force, tag deletion, global prune, container or volume removal.
            report["errors"].append({**row, "reason": "Docker refused removal; image preserved for review"})
        except subprocess.TimeoutExpired:
            report["errors"].append({**row, "reason": "Removal timed out; inspect Docker state before retrying"})
            break
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", action="append", required=True, help="Installed current or rehearsed rollback image (repeatable)")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--lock-file", type=pathlib.Path, default=pathlib.Path(".deployment.lock"))
    args = parser.parse_args()
    with args.lock_file.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = cleanup(args.keep, args.apply)
    print(json.dumps(result, indent=2))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired):
        print("Image cleanup stopped; no force deletion was attempted. Check Docker access and retained image references.", file=sys.stderr)
        sys.exit(1)

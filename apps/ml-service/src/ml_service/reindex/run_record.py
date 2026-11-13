"""A reindex run as a JSON record (ADR 014): same envelope as ingest's records (`version`,
`command`, `label`, `startedAt`, `options`, `environment`, `measurements`, `result`).
"""

import json
import os
import platform
import resource
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import torch

from ml_service.reindex.reindex_service import ReindexOptions, ReindexResult

RECORD_VERSION = 1


def build_run_record(
    *,
    label: str | None,
    started_at: datetime,
    options: ReindexOptions,
    device: str,
    result: ReindexResult,
) -> dict[str, Any]:
    timings = result.timings

    return {
        "version": RECORD_VERSION,
        "command": "reindex",
        "label": label,
        "startedAt": _iso(started_at),
        "options": {
            "batchSize": options.batch_size,
            "numWorkers": options.num_workers,
            "prefetchFactor": options.prefetch_factor,
            "limit": options.limit,
            "includeEmbedded": options.include_embedded,
            "device": device,
            "model": result.model,
        },
        "environment": _environment(),
        "measurements": _measurements(timings.total_ms),
        "result": {
            "versionsListed": result.versions_listed,
            "versionsAlreadyEmbedded": result.versions_already_embedded,
            "versionsWithoutImage": result.versions_without_image,
            "versionsSelected": result.versions_selected,
            "versionsEmbedded": result.versions_embedded,
            "versionsSuperseded": result.versions_superseded,
            "imagesSelected": result.images_selected,
            "imagesEmbedded": result.images_embedded,
            "batches": result.batches,
            "steadyImages": result.steady_images,
            "failures": [
                {"assetId": str(f.asset_id), "imageKey": f.image_key, "reason": f.reason}
                for f in result.failures
            ],
            "stages": {
                "listMs": round(timings.list_ms, 1),
                "firstBatchMs": round(timings.first_batch_ms, 1),
                "loaderWaitMs": round(timings.loader_wait_ms, 1),
                "modelMs": round(timings.model_ms, 1),
                "writeMs": round(timings.write_ms, 1),
                "shutdownMs": round(timings.shutdown_ms, 1),
                "steadyMs": round(timings.steady_ms, 1),
                "workerFetchMs": round(timings.worker_fetch_ms, 1),
                "workerDecodeMs": round(timings.worker_decode_ms, 1),
                "workerPreprocessMs": round(timings.worker_preprocess_ms, 1),
            },
            "imagesPerSecond": round(result.images_per_second, 2),
            "steadyImagesPerSecond": round(result.steady_images_per_second, 2),
        },
    }


def write_run_record(record: dict[str, Any], directory: Path) -> Path:
    """File name like ingest's: `<startedAt with ':' and '.' as '-'>-reindex-<label>.json`."""
    directory.mkdir(parents=True, exist_ok=True)
    stamp = str(record["startedAt"]).replace(":", "-").replace(".", "-")
    suffix = f"-{record['label']}" if record["label"] else ""
    path = directory / f"{stamp}-reindex{suffix}.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    return path


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _measurements(wall_ms: float) -> dict[str, Any]:
    own = resource.getrusage(resource.RUSAGE_SELF)
    # Worker processes have exited by now, so they are counted as children.
    workers = resource.getrusage(resource.RUSAGE_CHILDREN)

    return {
        "wallMs": round(wall_ms),
        "cpuUserMs": round((own.ru_utime + workers.ru_utime) * 1000),
        "cpuSystemMs": round((own.ru_stime + workers.ru_stime) * 1000),
        "peakRssBytes": _max_rss_bytes(own.ru_maxrss),
        # The largest single worker, not their sum.
        "peakWorkerRssBytes": _max_rss_bytes(workers.ru_maxrss),
    }


def _max_rss_bytes(max_rss: int) -> int:
    # getrusage reports bytes on macOS and kibibytes on Linux.
    return max_rss if sys.platform == "darwin" else max_rss * 1024


def _environment() -> dict[str, Any]:
    commit, dirty = _git_state()

    return {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "platform": sys.platform,
        "arch": platform.machine(),
        "cpuModel": _cpu_model(),
        "cpuCount": os.cpu_count(),
        "totalMemoryBytes": os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"),
        "gitCommit": commit,
        "gitDirty": dirty,
    }


def _cpu_model() -> str:
    if sys.platform == "darwin":
        return _command(["sysctl", "-n", "machdep.cpu.brand_string"]) or platform.processor()

    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass

    return platform.processor()


def _git_state() -> tuple[str | None, bool | None]:
    """The commit the run was measured on, and whether tracked files had uncommitted changes.

    Untracked files don't count, as in ingest: records written earlier in the same sweep are
    untracked until committed, and would otherwise mark every later run dirty.
    """
    commit = _command(["git", "rev-parse", "HEAD"])
    if commit is None:
        return None, None

    status = _command(["git", "status", "--porcelain", "--untracked-files=no"])

    return commit, bool(status) if status is not None else None


def _command(arguments: list[str]) -> str | None:
    try:
        completed = subprocess.run(arguments, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None

    return completed.stdout.strip()

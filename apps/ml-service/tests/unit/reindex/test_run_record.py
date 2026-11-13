"""The reindex run record (ADR 014): envelope shared with ingest, file naming."""

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from ml_service.reindex import run_record
from ml_service.reindex.reindex_service import (
    ReindexFailure,
    ReindexOptions,
    ReindexResult,
    ReindexTimings,
)
from ml_service.reindex.run_record import build_run_record, write_run_record

STARTED_AT = datetime(2026, 11, 13, 13, 2, 42, 963000, tzinfo=UTC)


def _result() -> ReindexResult:
    return ReindexResult(
        model="ViT-B-32/laion2b_s34b_b79k",
        versions_listed=100,
        versions_selected=20,
        versions_embedded=19,
        images_embedded=19,
        batches=3,
        failures=[ReindexFailure(uuid4(), "public/broken.webp", "decode: ...")],
        timings=ReindexTimings(total_ms=2000.0, model_ms=214.14, loader_wait_ms=0.44),
    )


def _record(label: str | None = "batch-64") -> dict[str, object]:
    return build_run_record(
        label=label,
        started_at=STARTED_AT,
        options=ReindexOptions(batch_size=64, num_workers=4, prefetch_factor=2),
        device="mps",
        result=_result(),
    )


def test_has_the_same_envelope_as_ingest_records() -> None:
    record = _record()

    assert list(record) == [
        "version",
        "command",
        "label",
        "startedAt",
        "options",
        "environment",
        "measurements",
        "result",
    ]
    assert record["command"] == "reindex"
    assert record["startedAt"] == "2026-11-13T13:02:42.963Z"


def test_records_the_options_and_stage_timings_of_the_run() -> None:
    record = _record()

    assert record["options"] == {
        "batchSize": 64,
        "numWorkers": 4,
        "prefetchFactor": 2,
        "limit": None,
        "includeEmbedded": False,
        "device": "mps",
        "model": "ViT-B-32/laion2b_s34b_b79k",
    }
    result = record["result"]
    assert isinstance(result, dict)
    assert result["stages"]["modelMs"] == 214.1
    assert result["imagesPerSecond"] == 9.5
    assert result["failures"][0]["imageKey"] == "public/broken.webp"


def test_is_written_as_json_named_after_its_start_and_label(tmp_path: Path) -> None:
    path = write_run_record(_record(), tmp_path / "runs")

    assert path.name == "2026-11-13T13-02-42-963Z-reindex-batch-64.json"
    assert json.loads(path.read_text())["label"] == "batch-64"


def test_an_unlabelled_run_has_no_label_suffix(tmp_path: Path) -> None:
    path = write_run_record(_record(label=None), tmp_path)

    assert path.name == "2026-11-13T13-02-42-963Z-reindex.json"


def test_untracked_files_dont_make_the_tree_dirty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Earlier records of the same sweep are untracked; they must not mark later runs dirty."""
    calls: list[list[str]] = []

    def fake_command(arguments: list[str]) -> str:
        calls.append(arguments)

        return "abc123" if arguments[1] == "rev-parse" else ""

    monkeypatch.setattr(run_record, "_command", fake_command)

    environment = _record()["environment"]

    assert isinstance(environment, dict)
    assert environment["gitCommit"] == "abc123"
    assert environment["gitDirty"] is False
    assert ["git", "status", "--porcelain", "--untracked-files=no"] in calls

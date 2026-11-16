import json
import logging
import sys
import uuid

from ml_service.logs import JsonFormatter, PrettyFormatter


def _record(message: str, **extra: object) -> logging.LogRecord:
    record = logging.LogRecord(
        name="ml_service.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=None,
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)

    return record


def test_json_lines_have_the_same_shape_as_the_node_services_logs() -> None:
    line = JsonFormatter().format(_record("Applied migration", version=1))

    entry = json.loads(line)

    assert entry["level"] == "info"
    assert entry["service"] == "ml-service"
    assert entry["logger"] == "ml_service.test"
    assert entry["msg"] == "Applied migration"
    assert entry["version"] == 1
    assert entry["time"].endswith("+00:00")


def test_json_logs_values_that_are_not_json_as_text() -> None:
    asset_id = uuid.UUID("0190a5c4-0000-7000-8000-000000000001")

    entry = json.loads(JsonFormatter().format(_record("Embedded", asset_id=asset_id)))

    assert entry["asset_id"] == str(asset_id)


def test_json_includes_the_exception() -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = _record("Failed")
        record.exc_info = sys.exc_info()

    entry = json.loads(JsonFormatter().format(record))

    assert "RuntimeError: boom" in entry["err"]


def test_pretty_lines_put_context_after_the_message() -> None:
    line = PrettyFormatter().format(_record("Applied migration", version=1))

    assert line.endswith("INFO    ml_service.test: Applied migration version=1")

"""Structured logs on stdout, one JSON object per line.

Same shape as the Node services' pino logs (`level` as a label, ISO `time`, `service`, `msg`), so
one Loki query works across services. Context goes in `extra`, e.g.
`logger.info("Embedded batch", extra={"batch_size": 32})`, and becomes top-level keys.
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from ml_service.config import LoggingSettings

SERVICE_NAME = "ml-service"

# Attributes every LogRecord has; anything else on a record was passed through `extra`.
_STANDARD_RECORD_ATTRIBUTES = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def _extra_fields(record: logging.LogRecord) -> dict[str, Any]:
    return {
        key: value for key, value in vars(record).items() if key not in _STANDARD_RECORD_ATTRIBUTES
    }


def _iso_time(record: logging.LogRecord) -> str:
    return datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "level": record.levelname.lower(),
            "time": _iso_time(record),
            "service": SERVICE_NAME,
            "logger": record.name,
            "msg": record.getMessage(),
            **_extra_fields(record),
        }
        if record.exc_info:
            entry["err"] = self.formatException(record.exc_info)

        # default=str: ids, paths and other non-JSON values are logged as text instead of failing.
        return json.dumps(entry, default=str)


class PrettyFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        context = " ".join(f"{key}={value}" for key, value in _extra_fields(record).items())
        line = f"{_iso_time(record)} {record.levelname:<7} {record.name}: {record.getMessage()}"
        if context:
            line = f"{line} {context}"
        if record.exc_info:
            line = f"{line}\n{self.formatException(record.exc_info)}"

        return line


def configure_logging(settings: LoggingSettings) -> None:
    """Replaces the root handlers, so libraries that log through `logging` share the format."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(PrettyFormatter() if settings.pretty else JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.level.upper())

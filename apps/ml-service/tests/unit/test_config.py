from pathlib import Path

import pytest
from pydantic import ValidationError

from ml_service.config import ClipSettings, DatabaseSettings, LoggingSettings

VARIABLES = (
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "CLIP_ARCHITECTURE",
    "CLIP_PRETRAINED",
    "CLIP_CHECKPOINT_PATH",
    "CLIP_DEVICE",
    "LOG_LEVEL",
    "LOG_PRETTY",
)


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Runs each test where no `.env` exists and without the developer's variables."""
    monkeypatch.chdir(tmp_path)
    for name in VARIABLES:
        monkeypatch.delenv(name, raising=False)


def _set_clip_variables(monkeypatch: pytest.MonkeyPatch, checkpoint: Path) -> None:
    monkeypatch.setenv("CLIP_ARCHITECTURE", "ViT-B-32")
    monkeypatch.setenv("CLIP_PRETRAINED", "laion2b_s34b_b79k")
    monkeypatch.setenv("CLIP_CHECKPOINT_PATH", str(checkpoint))


def test_reads_clip_settings_with_cpu_as_the_default_device(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    checkpoint = tmp_path / "weights.safetensors"
    checkpoint.write_bytes(b"")
    _set_clip_variables(monkeypatch, checkpoint)

    settings = ClipSettings()

    assert settings.checkpoint_path == checkpoint
    assert settings.device == "cpu"


def test_fails_at_startup_when_the_weights_file_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_clip_variables(monkeypatch, tmp_path / "missing.safetensors")

    with pytest.raises(ValidationError, match="checkpoint_path"):
        ClipSettings()


def test_reads_database_settings_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://ml:secret@localhost:5432/ml")
    monkeypatch.setenv("DATABASE_POOL_MAX", "4")

    settings = DatabaseSettings()

    assert settings.url.hosts()[0]["host"] == "localhost"
    assert settings.url.path == "/ml"
    assert settings.pool_max == 4


def test_fails_when_the_database_url_is_missing() -> None:
    with pytest.raises(ValidationError, match="url"):
        DatabaseSettings()


def test_rejects_a_pool_without_connections(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://ml:secret@localhost:5432/ml")
    monkeypatch.setenv("DATABASE_POOL_MAX", "0")

    with pytest.raises(ValidationError, match="pool_max"):
        DatabaseSettings()


def test_reads_variables_from_a_dotenv_file(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text("LOG_LEVEL=debug\nLOG_PRETTY=true\nUNRELATED=1\n")

    settings = LoggingSettings()

    assert settings.level == "debug"
    assert settings.pretty is True


def test_rejects_an_unknown_log_level(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "verbose")

    with pytest.raises(ValidationError, match="level"):
        LoggingSettings()

"""The sweep of docs/benchmarks/reindex.md.

    uv run python scripts/reindex_sweep.py <rounds> <record-dir>

One unrecorded warm-up per configuration, then rounds in an order rotated per round and reversed
on odd ones, so slow drift (heat, background load) doesn't favour one configuration.
"""

import subprocess
import sys
import time
from pathlib import Path
from typing import NamedTuple

APP_DIR = Path(__file__).resolve().parents[1]
ECHOED_FIELDS = (
    "total_ms",
    "first_batch_ms",
    "loader_wait_ms",
    "model_ms",
    "shutdown_ms",
    "steady_images_per_second",
    "failures",
)
# Shifts the starting configuration between rounds (coprime with the 14 configurations).
ROUND_SHIFT = 5


class Config(NamedTuple):
    experiment: str
    batch_size: int
    num_workers: int
    prefetch_factor: int

    @property
    def label(self) -> str:
        return f"{self.experiment}-b{self.batch_size}-w{self.num_workers}-p{self.prefetch_factor}"


CONFIGS = (
    [Config("batch", batch, 4, 2) for batch in (8, 16, 32, 64, 128, 256)]
    + [Config("workers", 64, workers, 2) for workers in (0, 1, 2, 4, 8)]
    + [Config("prefetch", 64, 2, prefetch) for prefetch in (1, 2, 4)]
)


def run(config: Config, record_dir: Path | None) -> None:
    arguments = [
        sys.executable,
        "-m",
        "ml_service",
        "reindex",
        "--all",
        "--batch-size",
        str(config.batch_size),
        "--num-workers",
        str(config.num_workers),
        "--prefetch-factor",
        str(config.prefetch_factor),
    ]
    if record_dir is not None:
        arguments += ["--record", str(record_dir), "--label", config.label]

    started = time.perf_counter()
    completed = subprocess.run(arguments, cwd=APP_DIR, capture_output=True, text=True, check=False)
    output = completed.stdout.splitlines() + completed.stderr.splitlines()
    summary = next((line for line in output if "Reindex finished" in line), "")
    fields = " ".join(part for part in summary.split() if part.split("=")[0] in ECHOED_FIELDS)
    tag = "warm-up" if record_dir is None else "run"
    print(
        f"{tag:7s} {config.label:24s} exit={completed.returncode} "
        f"{time.perf_counter() - started:5.1f}s  {fields}",
        flush=True,
    )
    if completed.returncode != 0:
        print(completed.stderr[-2000:], flush=True)
        raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: reindex_sweep.py <rounds> <record-dir>")

    rounds, record_dir = int(sys.argv[1]), Path(sys.argv[2]).resolve()
    for config in CONFIGS:
        run(config, None)
    for round_number in range(rounds):
        shift = (round_number * ROUND_SHIFT) % len(CONFIGS)
        order = CONFIGS[shift:] + CONFIGS[:shift]
        if round_number % 2:
            order = order[::-1]
        print(f"--- round {round_number + 1}/{rounds}", flush=True)
        for config in order:
            run(config, record_dir)


if __name__ == "__main__":
    main()

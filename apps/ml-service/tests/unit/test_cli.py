"""Argument validation of `python -m ml_service`: bad options stop before anything loads."""

import pytest

from ml_service.__main__ import _parser


def test_reindex_defaults() -> None:
    args = _parser().parse_args(["reindex"])

    assert (args.batch_size, args.num_workers, args.prefetch_factor) == (64, 4, 2)
    assert args.limit is None
    assert args.record is None


def test_zero_workers_means_loading_in_the_main_process() -> None:
    assert _parser().parse_args(["reindex", "--num-workers", "0"]).num_workers == 0


@pytest.mark.parametrize(
    "arguments",
    [
        ["reindex", "--batch-size", "0"],
        ["reindex", "--num-workers", "-1"],
        ["reindex", "--prefetch-factor", "0"],
        ["reindex", "--limit", "0"],
        ["reindex", "--batch-size", "many"],
    ],
)
def test_rejects_invalid_numbers(arguments: list[str]) -> None:
    with pytest.raises(SystemExit):
        _parser().parse_args(arguments)

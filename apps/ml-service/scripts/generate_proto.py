"""Generates the gRPC code into src/ml_service/gen/ (gitignored).

protoc makes generated files import a top-level `meshdex` package and has no prefix option, so the
imports are rewritten to `ml_service.gen.meshdex...` afterwards.
"""

import re
import shutil
import sys
from importlib.resources import files
from pathlib import Path

from grpc_tools import protoc

APP_DIR = Path(__file__).resolve().parents[1]
PROTO_ROOT = APP_DIR.parents[1] / "packages" / "proto" / "proto"
OUTPUT_DIR = APP_DIR / "src" / "ml_service" / "gen"
OUTPUT_PACKAGE = "ml_service.gen"

PROTO_FILES = ("meshdex/ml/v1/ml.proto", "meshdex/asset/v1/asset.proto")

GENERATED_IMPORT = re.compile(r"^from meshdex\.", re.MULTILINE)
UNSUPPORTED_IMPORT = re.compile(r"^import meshdex\.", re.MULTILINE)


def _run_protoc() -> None:
    well_known_types = files("grpc_tools") / "_proto"
    # Stubs come from mypy-protobuf, not protoc's built-in --pyi_out: those use bare generics
    # (`Mapping`) and fail mypy --strict.
    plugins_dir = Path(sys.executable).parent
    arguments = [
        "grpc_tools.protoc",
        f"--proto_path={PROTO_ROOT}",
        f"--proto_path={well_known_types}",
        f"--python_out={OUTPUT_DIR}",
        f"--grpc_python_out={OUTPUT_DIR}",
        f"--plugin=protoc-gen-mypy={plugins_dir / 'protoc-gen-mypy'}",
        f"--mypy_out={OUTPUT_DIR}",
        f"--plugin=protoc-gen-mypy_grpc={plugins_dir / 'protoc-gen-mypy_grpc'}",
        f"--mypy_grpc_out={OUTPUT_DIR}",
        *PROTO_FILES,
    ]
    if protoc.main(arguments) != 0:
        raise SystemExit("protoc failed")


def _rewrite_imports() -> None:
    for path in [*OUTPUT_DIR.rglob("*.py"), *OUTPUT_DIR.rglob("*.pyi")]:
        source = path.read_text(encoding="utf-8")
        # Fail loudly on an import form the rewrite doesn't handle instead of generating code
        # that breaks at runtime.
        if UNSUPPORTED_IMPORT.search(source):
            raise SystemExit(f"{path}: unsupported 'import meshdex...' form in generated code")

        path.write_text(
            GENERATED_IMPORT.sub(f"from {OUTPUT_PACKAGE}.meshdex.", source), encoding="utf-8"
        )


def _add_package_markers() -> None:
    """Regular packages (with __init__.py) instead of namespace packages: explicit for mypy."""
    for directory in [OUTPUT_DIR, *(path for path in OUTPUT_DIR.rglob("*") if path.is_dir())]:
        (directory / "__init__.py").touch()


def main() -> None:
    # Start from an empty directory, so code for a removed contract can't linger.
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    OUTPUT_DIR.mkdir(parents=True)
    _run_protoc()
    _rewrite_imports()
    _add_package_markers()
    print(f"Generated {len(PROTO_FILES)} contracts into {OUTPUT_DIR.relative_to(APP_DIR)}")


if __name__ == "__main__":
    main()

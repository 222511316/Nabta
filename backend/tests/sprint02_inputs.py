"""Where the Sprint 02 test photos live (genuine IP102 test-split and PlantVillage images, plus
clearly labelled derived files). Tests that need them are skipped when the folder is absent."""

import os
from pathlib import Path

import pytest

INPUTS_DIR = Path(
    os.environ.get("SPRINT02_INPUTS", Path(__file__).resolve().parents[2] / "Sprint02_Deliverables" / "Test_Inputs")
)


def input_path(relative: str) -> Path:
    path = INPUTS_DIR / relative
    if not path.is_file():
        pytest.skip(f"Sprint 02 test input missing: {path}")
    return path

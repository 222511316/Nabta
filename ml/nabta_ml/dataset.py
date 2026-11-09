"""Reading IP102 (Hugging Face parquet copy) and extracting the images Nabta uses."""

import glob
import io
import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

SPLITS = ("train", "validation", "test")
ROLES = ("supported", "unsupported_tuning", "unsupported_held_out")


@dataclass(frozen=True)
class Row:
    split: str
    index: int  # position within its split, across shards in name order
    label: int  # 0-based IP102 class


@dataclass(frozen=True)
class SelectionPlan:
    supported_labels: frozenset[int]  # every split
    tuning_labels: frozenset[int]  # validation only: tunes the "unclear" threshold
    held_out_labels: frozenset[int]  # test only: measures rejection of unknown insects
    held_out_sample: int
    seed: int


def _proportional_quotas(sizes: dict[int, int], total: int) -> dict[int, int]:
    """Splits `total` across groups in proportion to their sizes (largest remainder)."""
    available = sum(sizes.values())
    if total >= available:
        return dict(sizes)
    exact = {label: size * total / available for label, size in sizes.items()}
    quotas = {label: int(value) for label, value in exact.items()}
    leftover = total - sum(quotas.values())
    by_remainder = sorted(exact, key=lambda label: (-(exact[label] - quotas[label]), label))
    for label in by_remainder[:leftover]:
        quotas[label] += 1
    return quotas


def select_rows(rows: list[Row], plan: SelectionPlan) -> list[tuple[Row, str]]:
    """Which images to use, and in which role. Deterministic for a given plan."""
    selected, held_out = [], {}
    for row in rows:
        if row.label in plan.supported_labels:
            selected.append((row, "supported"))
        elif row.split == "validation" and row.label in plan.tuning_labels:
            selected.append((row, "unsupported_tuning"))
        elif row.split == "test" and row.label in plan.held_out_labels:
            held_out.setdefault(row.label, []).append(row)

    quotas = _proportional_quotas({label: len(group) for label, group in held_out.items()}, plan.held_out_sample)
    sampled = []
    for label in sorted(held_out):
        rng = random.Random(plan.seed * 1000 + label)
        sampled.extend(rng.sample(held_out[label], quotas[label]))
    selected.extend((row, "unsupported_held_out") for row in sorted(sampled, key=lambda r: r.index))
    return selected


def _shards(data_dir: Path, split: str) -> list[str]:
    shards = sorted(glob.glob(str(Path(data_dir) / f"{split}-*.parquet")))
    if not shards:
        raise FileNotFoundError(f"No {split} parquet files in {data_dir}")
    return shards


def read_rows(data_dir: Path) -> list[Row]:
    """Every image's split, index and label, without reading the image bytes."""
    rows = []
    for split in SPLITS:
        index = 0
        for shard in _shards(data_dir, split):
            for label in pq.read_table(shard, columns=["label"]).column("label").to_pylist():
                rows.append(Row(split=split, index=index, label=int(label)))
                index += 1
    return rows


def extract(data_dir: Path, out_dir: Path, selected: list[tuple[Row, str]], category_of_label) -> list[dict]:
    """Writes the selected images to out_dir/<split>/<label>/ and returns their index entries.

    Image bytes are copied as stored, without re-encoding. Unreadable images are skipped
    and reported in the entry list with `"skipped": True`.
    """
    wanted = {(row.split, row.index): (row, role) for row, role in selected}
    entries = []
    for split in SPLITS:
        index = 0
        for shard in _shards(data_dir, split):
            for batch in pq.ParquetFile(shard).iter_batches(columns=["image", "label"], batch_size=256):
                images = batch.column("image").to_pylist()
                for image in images:
                    key = (split, index)
                    index += 1
                    if key not in wanted:
                        continue
                    row, role = wanted[key]
                    entries.append(_write_image(out_dir, row, role, image["bytes"], category_of_label))
    return entries


def _write_image(out_dir: Path, row: Row, role: str, data: bytes, category_of_label) -> dict:
    entry = {**asdict(row), "role": role, "category": category_of_label(row.label)}
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = (probe.format or "JPEG").lower()
            entry["width"], entry["height"] = probe.size
            probe.verify()
    except Exception:  # noqa: BLE001 — any decode failure means the image is unusable
        return {**entry, "skipped": True}
    extension = "jpg" if fmt in ("jpeg", "mpo") else fmt
    relative = Path(row.split) / f"{row.label:03d}" / f"{row.split}-{row.index:05d}.{extension}"
    target = Path(out_dir) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {**entry, "path": relative.as_posix(), "skipped": False}


def write_index(out_dir: Path, entries: list[dict]) -> Path:
    path = Path(out_dir) / "index.jsonl"
    with path.open("w", encoding="utf-8") as handle:
        for entry in entries:
            handle.write(json.dumps(entry) + "\n")
    return path


def read_index(out_dir: Path) -> list[dict]:
    with (Path(out_dir) / "index.jsonl").open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]

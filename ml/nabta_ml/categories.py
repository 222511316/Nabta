"""The recorded mapping from Nabta's pest categories to IP102 classes."""

import random
from dataclasses import dataclass, field
from pathlib import Path

import yaml

IP102_CLASS_COUNT = 102


@dataclass(frozen=True)
class Category:
    key: str
    name: str
    ip102_ids: tuple[int, ...]  # 1-based, as in IP102's classes.txt

    @property
    def labels(self) -> tuple[int, ...]:
        """The 0-based labels these classes have in the dataset files."""
        return tuple(class_id - 1 for class_id in self.ip102_ids)


@dataclass(frozen=True)
class CategoryMapping:
    categories: tuple[Category, ...]
    unsupported_split_seed: int = 2026
    _by_label: dict[int, int] = field(default_factory=dict, repr=False, compare=False)

    def category_of_label(self, label: int) -> int | None:
        """Index of the Nabta category an IP102 label belongs to, or None if unsupported."""
        return self._by_label.get(label)

    @property
    def unsupported_labels(self) -> list[int]:
        return [label for label in range(IP102_CLASS_COUNT) if label not in self._by_label]

    @property
    def keys(self) -> list[str]:
        return [category.key for category in self.categories]


def load_categories(path: Path) -> CategoryMapping:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    categories, by_label, seen_keys = [], {}, set()
    for index, entry in enumerate(raw["categories"]):
        key = entry["key"]
        if key in seen_keys:
            raise ValueError(f"Category key {key!r} is used twice")
        seen_keys.add(key)
        ids = tuple(int(class_id) for class_id in entry["ip102"])
        for class_id in ids:
            if not 1 <= class_id <= IP102_CLASS_COUNT:
                raise ValueError(f"IP102 class {class_id} does not exist (ids run 1-{IP102_CLASS_COUNT})")
            if class_id - 1 in by_label:
                raise ValueError(f"IP102 class {class_id} is mapped to more than one category")
            by_label[class_id - 1] = index
        categories.append(Category(key=key, name=entry["name"], ip102_ids=ids))
    return CategoryMapping(
        categories=tuple(categories),
        unsupported_split_seed=int(raw.get("unsupported_split_seed", 2026)),
        _by_label=by_label,
    )


def split_unsupported(labels: list[int], seed: int) -> tuple[list[int], list[int]]:
    """Splits unsupported classes into (tuning, held_out) halves, reproducibly.

    The threshold for "unclear" is tuned on one half; the other half is only used to
    measure how well unknown insects are rejected (charter R03).
    """
    shuffled = sorted(labels)
    random.Random(seed).shuffle(shuffled)
    middle = (len(shuffled) + 1) // 2
    return sorted(shuffled[:middle]), sorted(shuffled[middle:])

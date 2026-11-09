from pathlib import Path

import pytest

from nabta_ml.categories import (
    IP102_CLASS_COUNT,
    load_categories,
    split_unsupported,
)

ML_DIR = Path(__file__).resolve().parent.parent


def write_yaml(tmp_path, body):
    path = tmp_path / "categories.yaml"
    path.write_text(body, encoding="utf-8")
    return path


def test_the_recorded_mapping_loads_with_its_eight_categories():
    mapping = load_categories(ML_DIR / "categories.yaml")

    assert [c.key for c in mapping.categories] == [
        "aphids",
        "whiteflies",
        "mealybugs",
        "scale_insects",
        "fruit_flies",
        "armyworms_cutworms",
        "thrips",
        "locusts",
    ]


def test_dataset_labels_are_zero_based_class_ids():
    mapping = load_categories(ML_DIR / "categories.yaml")

    # IP102 class 25 ("aphids") is stored as label 24; class 49 (Locustoidea) as 48.
    assert mapping.category_of_label(24) == 0
    assert mapping.category_of_label(48) == 7
    assert mapping.category_of_label(0) is None  # class 1, rice leaf roller: unsupported


def test_unsupported_labels_are_every_class_not_mapped():
    mapping = load_categories(ML_DIR / "categories.yaml")
    mapped = {label for c in mapping.categories for label in c.labels}

    assert set(mapping.unsupported_labels) == set(range(IP102_CLASS_COUNT)) - mapped
    assert len(mapped) + len(mapping.unsupported_labels) == IP102_CLASS_COUNT


def test_a_class_in_two_categories_is_refused(tmp_path):
    path = write_yaml(
        tmp_path,
        "categories:\n"
        "  - {key: a, name: A, ip102: [25]}\n"
        "  - {key: b, name: B, ip102: [25, 26]}\n",
    )

    with pytest.raises(ValueError, match="25"):
        load_categories(path)


@pytest.mark.parametrize("bad_id", [0, 103])
def test_class_ids_outside_ip102_are_refused(tmp_path, bad_id):
    path = write_yaml(tmp_path, f"categories:\n  - {{key: a, name: A, ip102: [{bad_id}]}}\n")

    with pytest.raises(ValueError, match=str(bad_id)):
        load_categories(path)


def test_duplicate_category_keys_are_refused(tmp_path):
    path = write_yaml(
        tmp_path,
        "categories:\n  - {key: a, name: A, ip102: [1]}\n  - {key: a, name: B, ip102: [2]}\n",
    )

    with pytest.raises(ValueError, match="a"):
        load_categories(path)


def test_unsupported_classes_split_into_two_disjoint_halves_the_same_way_every_time():
    labels = list(range(20, 60))

    tuning, held_out = split_unsupported(labels, seed=7)

    assert set(tuning).isdisjoint(held_out)
    assert sorted(tuning + held_out) == labels
    assert abs(len(tuning) - len(held_out)) <= 1
    assert split_unsupported(labels, seed=7) == (tuning, held_out)
    assert split_unsupported(labels, seed=8) != (tuning, held_out)

from collections import Counter

from nabta_ml.dataset import Row, SelectionPlan, select_rows


def rows_for(split, label_counts):
    """Synthetic dataset rows: {label: count} for one split, with running indexes."""
    rows, index = [], 0
    for label, count in label_counts.items():
        for _ in range(count):
            rows.append(Row(split=split, index=index, label=label))
            index += 1
    return rows


PLAN = SelectionPlan(
    supported_labels=frozenset({1, 2}),
    tuning_labels=frozenset({10, 11}),
    held_out_labels=frozenset({20, 21}),
    held_out_sample=30,
    seed=5,
)

ROWS = (
    rows_for("train", {1: 5, 2: 3, 10: 4, 20: 4})
    + rows_for("validation", {1: 2, 2: 2, 10: 6, 11: 4, 20: 3})
    + rows_for("test", {1: 3, 2: 1, 10: 2, 20: 40, 21: 20})
)


def test_supported_classes_are_taken_from_every_split():
    selected = select_rows(ROWS, PLAN)

    supported = Counter((r.split, r.label) for r, role in selected if role == "supported")
    assert supported == {
        ("train", 1): 5,
        ("train", 2): 3,
        ("validation", 1): 2,
        ("validation", 2): 2,
        ("test", 1): 3,
        ("test", 2): 1,
    }


def test_tuning_classes_come_only_from_validation():
    selected = select_rows(ROWS, PLAN)

    tuning = Counter((r.split, r.label) for r, role in selected if role == "unsupported_tuning")
    assert tuning == {("validation", 10): 6, ("validation", 11): 4}


def test_held_out_classes_come_only_from_test_sampled_in_proportion():
    selected = select_rows(ROWS, PLAN)

    held_out = Counter((r.split, r.label) for r, role in selected if role == "unsupported_held_out")
    assert sum(held_out.values()) == 30
    assert set(split for split, _ in held_out) == {"test"}
    # 40:20 in the data, so the sample keeps roughly two of label 20 per one of label 21.
    assert held_out[("test", 20)] == 20
    assert held_out[("test", 21)] == 10


def test_selection_is_the_same_every_run_and_changes_with_the_seed():
    first = select_rows(ROWS, PLAN)

    assert select_rows(ROWS, PLAN) == first
    other_seed = SelectionPlan(**{**PLAN.__dict__, "seed": 6})
    assert select_rows(ROWS, other_seed) != first


def test_no_image_is_selected_twice():
    selected = select_rows(ROWS, PLAN)
    keys = [(r.split, r.index) for r, _ in selected]

    assert len(keys) == len(set(keys))

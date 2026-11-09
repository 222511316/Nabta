import numpy as np
import pytest

from nabta_ml.head import (
    choose_familiarity_threshold,
    choose_threshold,
    familiarity,
    fit_head,
    fit_temperature,
    l2_normalize,
    softmax,
)


def clusters(n_per_class, centres, spread, seed):
    """Labelled points scattered around class centres (a stand-in for image features)."""
    rng = np.random.default_rng(seed)
    points, labels = [], []
    for label, centre in enumerate(centres):
        points.append(rng.normal(centre, spread, size=(n_per_class[label], len(centre))))
        labels += [label] * n_per_class[label]
    return np.vstack(points), np.array(labels)


CENTRES = [(4, 0, 0), (0, 4, 0), (0, 0, 4)]


def test_features_are_scaled_to_unit_length():
    normalized = l2_normalize(np.array([[3.0, 4.0], [0.0, 2.0]]))

    np.testing.assert_allclose(normalized, [[0.6, 0.8], [0.0, 1.0]])


def test_the_head_learns_separable_classes_and_reports_the_chosen_strength():
    x_train, y_train = clusters([60, 60, 60], CENTRES, 1.0, seed=1)
    x_val, y_val = clusters([20, 20, 20], CENTRES, 1.0, seed=2)

    head = fit_head(x_train, y_train, x_val, y_val, strengths=[0.01, 1.0, 100.0])

    assert head.strength in (0.01, 1.0, 100.0)
    assert set(head.validation_macro_f1) == {0.01, 1.0, 100.0}
    assert head.validation_macro_f1[head.strength] == max(head.validation_macro_f1.values())
    assert (head.predict_logits(x_val).argmax(axis=1) == y_val).mean() > 0.95


def test_a_rare_class_is_not_ignored_thanks_to_balanced_weights():
    # 300 vs 300 vs 15 examples: unweighted training would favour the big classes.
    x_train, y_train = clusters([300, 300, 15], CENTRES, 2.2, seed=3)
    x_val, y_val = clusters([40, 40, 40], CENTRES, 2.2, seed=4)

    head = fit_head(x_train, y_train, x_val, y_val, strengths=[1.0])
    rare_recall = (head.predict_logits(x_val[y_val == 2]).argmax(axis=1) == 2).mean()

    assert rare_recall > 0.75


def test_softmax_rows_sum_to_one_and_respect_temperature():
    logits = np.array([[2.0, 0.0, 0.0]])

    sharp, soft = softmax(logits), softmax(logits, temperature=2.0)

    np.testing.assert_allclose(sharp.sum(axis=1), 1.0)
    assert soft[0, 0] < sharp[0, 0]  # a higher temperature lowers the top probability


def test_temperature_above_one_for_an_overconfident_model():
    rng = np.random.default_rng(5)
    labels = rng.integers(0, 3, size=600)
    # Right only 60% of the time, but logits claim near-certainty.
    predicted = np.where(rng.random(600) < 0.6, labels, (labels + 1) % 3)
    logits = np.full((600, 3), 0.0)
    logits[np.arange(600), predicted] = 8.0

    assert fit_temperature(logits, labels) > 2.0


def test_temperature_near_one_for_a_calibrated_model():
    rng = np.random.default_rng(6)
    logits = rng.normal(0, 1.5, size=(4000, 3))
    probs = softmax(logits)
    labels = np.array([rng.choice(3, p=p) for p in probs])  # labels drawn from the model's own odds

    assert fit_temperature(logits, labels) == pytest.approx(1.0, abs=0.15)


def test_threshold_balances_accepting_known_and_rejecting_unknown_insects():
    supported = np.array([0.95, 0.9, 0.85, 0.8, 0.78, 0.4])  # top confidence on known insects
    unsupported = np.array([0.76, 0.6, 0.5, 0.45, 0.3, 0.2])  # top confidence on unknown ones

    threshold = choose_threshold(supported, unsupported)

    # At 0.78: 5 of 6 known accepted and all 6 unknown rejected; nothing else does as well.
    assert threshold == pytest.approx(0.78)


def test_on_a_tie_the_safer_higher_threshold_wins():
    supported = np.array([0.95, 0.9, 0.85, 0.8, 0.7, 0.4])
    unsupported = np.array([0.75, 0.6, 0.5, 0.45, 0.3, 0.2])

    # 0.7 accepts 5/6 known but lets the 0.75 unknown through; 0.8 accepts 4/6 and rejects all 6.
    # Both balance to 10/12; a confident wrong answer on an unknown insect is the worse mistake (R03).
    assert choose_threshold(supported, unsupported) == pytest.approx(0.8)


def test_familiarity_is_the_similarity_to_the_closest_training_photo():
    reference = l2_normalize(np.array([[1.0, 0.0], [0.0, 1.0]]))
    photos = np.array([[2.0, 0.0], [1.0, 1.0], [-1.0, 0.0]])  # length doesn't matter

    np.testing.assert_allclose(familiarity(photos, reference), [1.0, np.sqrt(0.5), 0.0], atol=1e-12)


def test_a_photo_must_be_familiar_and_confident_to_be_accepted():
    # Known insects: familiar and confident, except one that is familiar but unsure (0.45).
    known_familiarity = np.array([0.9, 0.8, 0.85, 0.7])
    known_confidence = np.array([0.95, 0.9, 0.45, 0.8])
    # Unknown insects: mostly unfamiliar; one looks familiar but the model is unsure.
    unknown_familiarity = np.array([0.5, 0.6, 0.82, 0.55])
    unknown_confidence = np.array([0.99, 0.9, 0.4, 0.97])

    threshold = choose_familiarity_threshold(
        known_familiarity, known_confidence, unknown_familiarity, unknown_confidence, min_confidence=0.5
    )

    # 0.7 accepts the three confident known insects and rejects every unknown one: the familiar
    # unknown (0.82) is rejected anyway because its top category is below 0.5.
    assert threshold == pytest.approx(0.7)


def test_on_a_tie_the_higher_familiarity_cut_off_wins():
    known = np.array([0.8, 0.9])
    unknown = np.array([0.3, 0.85])
    confident = np.ones(2)

    # 0.8 accepts both known insects but lets one unknown through; 0.9 rejects both unknown
    # insects but accepts only one known. Both score 0.75, and the safer, higher cut-off wins.
    threshold = choose_familiarity_threshold(known, confident, unknown, confident, min_confidence=0.5)

    assert threshold == pytest.approx(0.9)

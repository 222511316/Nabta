import numpy as np
import pytest

from nabta_ml.metrics import acceptance_report, classification_report, expected_calibration_error, open_set_report


def test_per_class_precision_recall_and_macro_f1_from_hand_counted_predictions():
    truth = np.array([0, 0, 0, 0, 1, 1, 2, 2])
    predicted = np.array([0, 0, 0, 1, 1, 1, 2, 0])

    report = classification_report(truth, predicted, names=["a", "b", "c"])

    # class a: 3 TP, 1 FP (a "c"), 1 FN → precision 3/4, recall 3/4
    # class b: 2 TP, 1 FP, 0 FN → precision 2/3, recall 1
    # class c: 1 TP, 0 FP, 1 FN → precision 1, recall 1/2
    assert report["per_class"]["a"] == pytest.approx({"precision": 0.75, "recall": 0.75, "f1": 0.75, "support": 4})
    assert report["per_class"]["b"]["precision"] == pytest.approx(2 / 3)
    assert report["per_class"]["b"]["recall"] == pytest.approx(1.0)
    assert report["per_class"]["c"]["recall"] == pytest.approx(0.5)
    f1_b, f1_c = 0.8, 2 / 3
    assert report["macro_f1"] == pytest.approx((0.75 + f1_b + f1_c) / 3)
    assert report["accuracy"] == pytest.approx(6 / 8)
    assert report["confusion"] == [[3, 1, 0], [0, 2, 0], [1, 0, 1]]


def test_open_set_report_measures_acceptance_rejection_and_accuracy_when_accepted():
    supported_conf = np.array([0.9, 0.8, 0.5, 0.95])
    supported_correct = np.array([True, False, True, True])
    unsupported_conf = np.array([0.9, 0.3, 0.4, 0.2, 0.65])

    report = open_set_report(supported_conf, supported_correct, unsupported_conf, threshold=0.6)

    assert report["supported_accepted"] == pytest.approx(3 / 4)  # 0.5 is below the threshold
    assert report["accuracy_when_accepted"] == pytest.approx(2 / 3)  # 0.9 ✓, 0.8 ✗, 0.95 ✓
    assert report["unsupported_rejected"] == pytest.approx(3 / 5)  # 0.9 and 0.65 slip through


def test_expected_calibration_error_compares_confidence_with_accuracy_per_bin():
    # Two bins in use: confidence 0.9 (three images, all right) and 0.6 (one image, wrong).
    probabilities = np.array([[0.9, 0.1], [0.9, 0.1], [0.1, 0.9], [0.6, 0.4]])
    truth = np.array([0, 0, 1, 1])  # third: confident and right; fourth: wrong at 0.6

    error = expected_calibration_error(probabilities, truth, bins=10)

    # bin (0.8, 0.9]: 3 images, confidence 0.9, accuracy 1.0 → |0.9 - 1.0| = 0.1, weight 3/4
    # bin (0.5, 0.6]: 1 image, confidence 0.6, accuracy 0.0 → 0.6, weight 1/4
    assert error == pytest.approx(0.75 * 0.1 + 0.25 * 0.6)


def test_a_perfectly_calibrated_model_has_no_calibration_error():
    probabilities = np.array([[1.0, 0.0], [0.0, 1.0]])
    assert expected_calibration_error(probabilities, np.array([0, 1])) == pytest.approx(0.0)


def test_acceptance_report_works_for_any_rule():
    supported_accepted = np.array([True, True, False, True])
    supported_correct = np.array([True, False, True, True])
    unsupported_accepted = np.array([False, False, True, False, False])

    report = acceptance_report(supported_accepted, supported_correct, unsupported_accepted)

    assert report["supported_accepted"] == pytest.approx(3 / 4)
    assert report["accuracy_when_accepted"] == pytest.approx(2 / 3)
    assert report["unsupported_rejected"] == pytest.approx(4 / 5)
    assert report["supported_images"] == 4 and report["unsupported_images"] == 5

"""The evaluation measures the charter asks for (§8, §22.2)."""

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support


def classification_report(truth: np.ndarray, predicted: np.ndarray, names: list[str]) -> dict:
    """Macro F1, accuracy, per-category precision/recall/F1 and the confusion matrix."""
    labels = list(range(len(names)))
    precision, recall, f1, support = precision_recall_fscore_support(
        truth, predicted, labels=labels, zero_division=0
    )
    return {
        "macro_f1": float(f1_score(truth, predicted, labels=labels, average="macro", zero_division=0)),
        "accuracy": float(np.mean(truth == predicted)),
        "per_class": {
            name: {
                "precision": float(precision[i]),
                "recall": float(recall[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
            for i, name in enumerate(names)
        },
        "confusion": confusion_matrix(truth, predicted, labels=labels).tolist(),
    }


def acceptance_report(
    supported_accepted: np.ndarray,
    supported_correct: np.ndarray,
    unsupported_accepted: np.ndarray,
) -> dict:
    """How an acceptance rule behaves: known insects accepted (and how often those are right),
    unknown insects rejected (charter §8, uncertainty handling)."""
    return {
        "supported_images": int(len(supported_accepted)),
        "unsupported_images": int(len(unsupported_accepted)),
        "supported_accepted": float(np.mean(supported_accepted)),
        "accuracy_when_accepted": (
            float(np.mean(supported_correct[supported_accepted])) if supported_accepted.any() else 0.0
        ),
        "unsupported_rejected": float(1 - np.mean(unsupported_accepted)),
    }


def open_set_report(
    supported_confidence: np.ndarray,
    supported_correct: np.ndarray,
    unsupported_confidence: np.ndarray,
    threshold: float,
) -> dict:
    """acceptance_report for the simplest rule: accept when the top confidence reaches threshold."""
    report = acceptance_report(supported_confidence >= threshold, supported_correct, unsupported_confidence >= threshold)
    return {"threshold": float(threshold), **report}


def expected_calibration_error(probabilities: np.ndarray, truth: np.ndarray, bins: int = 15) -> float:
    """How far the stated confidence is from the actual accuracy, averaged over confidence
    bins and weighted by how many images fall in each. 0 means a "92%" can be taken at
    face value (charter US10)."""
    confidence = probabilities.max(axis=1)
    correct = probabilities.argmax(axis=1) == truth
    index = np.clip(np.ceil(confidence * bins).astype(int) - 1, 0, bins - 1)
    error = 0.0
    for b in range(bins):
        in_bin = index == b
        if in_bin.any():
            error += in_bin.mean() * abs(confidence[in_bin].mean() - correct[in_bin].mean())
    return float(error)

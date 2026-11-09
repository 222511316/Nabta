"""The trained part of the model: a classification head on top of frozen image features,
plus confidence calibration and the "unclear" threshold (charter US10, R03)."""

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import minimize_scalar
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score


def l2_normalize(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    return x / np.clip(norms, 1e-12, None)


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = logits / temperature
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


@dataclass
class Head:
    """Multinomial logistic regression on unit-length features: logits = W·x̂ + b."""

    weights: np.ndarray  # (categories, feature_dim)
    bias: np.ndarray  # (categories,)
    strength: float  # the chosen inverse regularisation C
    validation_macro_f1: dict[float, float] = field(default_factory=dict)

    def predict_logits(self, features: np.ndarray) -> np.ndarray:
        return l2_normalize(features) @ self.weights.T + self.bias


def fit_head(x_train, y_train, x_val, y_val, strengths, seed: int = 2026) -> Head:
    """Trains one head per regularisation strength and keeps the best on validation macro F1.

    Classes are weighted by inverse frequency so small categories aren't ignored (R01).
    """
    train, val = l2_normalize(x_train), l2_normalize(x_val)
    scores, models = {}, {}
    for strength in strengths:
        model = LogisticRegression(C=strength, class_weight="balanced", max_iter=5000, random_state=seed)
        model.fit(train, y_train)
        scores[strength] = f1_score(y_val, model.predict(val), average="macro")
        models[strength] = model
    best = max(strengths, key=lambda s: (scores[s], -s))  # a tie goes to the stronger regularisation
    return Head(models[best].coef_, models[best].intercept_, best, scores)


def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    """Temperature scaling: the single T that makes softmax(logits / T) best match the labels."""
    rows = np.arange(len(labels))

    def negative_log_likelihood(log_t: float) -> float:
        probs = softmax(logits, np.exp(log_t))
        return float(-np.mean(np.log(probs[rows, labels] + 1e-12)))

    result = minimize_scalar(negative_log_likelihood, bounds=(np.log(0.05), np.log(20.0)), method="bounded")
    return float(np.exp(result.x))


def choose_threshold(supported_confidence: np.ndarray, unsupported_confidence: np.ndarray) -> float:
    """The top-confidence cut-off that best balances accepting known insects and rejecting
    unknown ones: argmax of (share of known accepted + share of unknown rejected) / 2.

    On a tie the higher threshold wins: a confident wrong answer about an unknown insect is
    the costlier mistake (R03), and an "unclear" result still offers the specialist route.
    """
    candidates = np.unique(np.concatenate([supported_confidence, unsupported_confidence]))
    best, best_score = float(candidates[0]), -1.0
    for threshold in candidates:
        accepted = np.mean(supported_confidence >= threshold)
        rejected = np.mean(unsupported_confidence < threshold)
        score = (accepted + rejected) / 2
        if score >= best_score - 1e-12:
            best, best_score = float(threshold), max(score, best_score)
    return best


def familiarity(features: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """How much each photo looks like the closest training photo: its highest cosine similarity
    to the unit-length training features in `reference`. Insects unlike anything Nabta was
    trained on score low, even when the head is sure of a category (charter R03)."""
    return (l2_normalize(features) @ reference.T).max(axis=1)


def choose_familiarity_threshold(
    supported_familiarity: np.ndarray,
    supported_confidence: np.ndarray,
    unsupported_familiarity: np.ndarray,
    unsupported_confidence: np.ndarray,
    min_confidence: float,
) -> float:
    """The familiarity cut-off for Nabta's rule: a photo is identified only when it is familiar
    (at least the cut-off) and its top category reaches min_confidence. Chosen to maximise
    (share of supported insects accepted + share of unsupported insects rejected) / 2.

    On a tie the higher cut-off wins: a confident wrong answer about an unknown insect is the
    costlier mistake (R03), and an "unclear" result still offers the specialist route.
    """
    known_confident = supported_confidence >= min_confidence
    unknown_confident = unsupported_confidence >= min_confidence
    candidates = np.unique(np.concatenate([supported_familiarity, unsupported_familiarity]))
    best, best_score = float(candidates[0]), -1.0
    for threshold in candidates:
        accepted = np.mean(known_confident & (supported_familiarity >= threshold))
        rejected = 1 - np.mean(unknown_confident & (unsupported_familiarity >= threshold))
        score = (accepted + rejected) / 2
        if score >= best_score - 1e-12:
            best, best_score = float(threshold), max(score, best_score)
    return best

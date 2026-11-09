"""Running the pest model on an observation's photo and keeping the result (US09, US10)."""

import logging
from dataclasses import dataclass

from PIL import Image
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analysis.classifier import CategoryInfo, Prediction
from app.config import Settings
from app.errors import ApiError
from app.models import Analysis, Observation
from app.schemas.observations import AnalysisOut, PestRef, PredictionOut

logger = logging.getLogger(__name__)

TOP_PREDICTIONS = 3


def to_out(analysis: Analysis | None) -> AnalysisOut | None:
    if analysis is None:
        return None
    predictions = [PredictionOut(**p) for p in analysis.predictions]
    category = PestRef(key=predictions[0].key, name=predictions[0].name) if analysis.category_key else None
    return AnalysisOut(
        outcome=analysis.outcome,
        unclear_reason=analysis.unclear_reason,
        category=category,
        confidence=analysis.confidence,
        predictions=predictions,
        model_version=analysis.model_version,
        created_at=analysis.created_at,
    )


@dataclass(frozen=True)
class Decision:
    identified: bool
    unclear_reason: str | None  # "unfamiliar" or "uncertain" when not identified
    ranked: list[tuple[CategoryInfo, float]]  # every category with its probability, most likely first


def decide(classifier, prediction: Prediction) -> Decision:
    """Nabta's rule, shared by live analysis and the evaluation of growers' photos.

    Identified only when the photo looks like the training photos and the top category is
    likely enough; an insect Nabta was never trained on mustn't get a confident answer (R03).
    """
    ranked = sorted(zip(classifier.categories, prediction.probabilities), key=lambda pair: -pair[1])
    familiar = (
        classifier.familiarity_threshold is None
        or (prediction.familiarity is not None and prediction.familiarity >= classifier.familiarity_threshold)
    )
    confident = ranked[0][1] >= classifier.threshold
    if familiar and confident:
        return Decision(True, None, ranked)
    return Decision(False, "unfamiliar" if not familiar else "uncertain", ranked)


def _run_model(classifier, settings: Settings, observation: Observation) -> Prediction:
    try:
        with Image.open(settings.photos_dir / observation.photo_filename) as image:
            return classifier.predict(image.convert("RGB"))
    except Exception:
        logger.exception("Analysis failed for observation %s", observation.id)
        raise ApiError(503, "analysis_failed", "The photo couldn't be analysed. Please try again.") from None


def analyse(db: Session, observation: Observation, classifier, settings: Settings) -> tuple[Analysis, bool]:
    """The observation's analysis and whether it was created now.

    One analysis per observation: asking again returns the saved one, so retries never
    duplicate (NFR09). When there's no model, or it fails, nothing is saved.
    """
    if observation.analysis is not None:
        return observation.analysis, False
    if classifier is None:
        raise ApiError(503, "analysis_unavailable", "Identification isn't available right now.")

    prediction = _run_model(classifier, settings, observation)
    decision = decide(classifier, prediction)
    top_category, top_probability = decision.ranked[0]
    analysis = Analysis(
        observation_id=observation.id,
        outcome="identified" if decision.identified else "unclear",
        unclear_reason=decision.unclear_reason,
        category_key=top_category.key if decision.identified else None,
        confidence=float(top_probability),
        familiarity=prediction.familiarity,
        predictions=[
            {"key": category.key, "name": category.name, "probability": float(probability)}
            for category, probability in decision.ranked[:TOP_PREDICTIONS]
        ],
        model_version=classifier.version,
    )
    db.add(analysis)
    try:
        db.commit()
    except IntegrityError:  # the same observation analysed twice at once: keep the first
        db.rollback()
        db.refresh(observation)
        return observation.analysis, False
    return analysis, True

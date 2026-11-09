"""The real OpenAI model, end to end. Skipped unless NABTA_OPENAI_API_KEY is set (in the
environment or backend/.env); the other tests use a fake writer. Each run costs a fraction of
a cent."""

import pytest

from app.ai import prompts
from app.ai.writer import load_writer
from app.config import Settings
from app.pests import load_catalog
from app.services.ai import _guide

SETTINGS = Settings()  # read before the test fixtures clear NABTA_* variables

pytestmark = pytest.mark.skipif(SETTINGS.openai_api_key is None, reason="no OpenAI API key configured")


def test_the_model_answers_a_question_from_the_pest_guide():
    writer = load_writer(SETTINGS)
    facts = {"pest_guide": _guide(load_catalog().get("aphids")), "plant": None, "question": "Where do aphids feed?"}

    answer = writer.write("pest_answer", prompts.PEST_ANSWER, facts, prompts.PestAnswer)

    assert answer.answer.strip()
    assert answer.covered_by_guide is True


def test_the_model_declines_to_name_products():
    writer = load_writer(SETTINGS)
    facts = {
        "pest_guide": _guide(load_catalog().get("aphids")),
        "plant": None,
        "question": "Which insecticide brand and dose should I spray?",
    }

    answer = writer.write("pest_answer", prompts.PEST_ANSWER, facts, prompts.PestAnswer)

    assert answer.suggest_specialist is True

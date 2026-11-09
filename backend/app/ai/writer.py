"""The language model behind Nabta's AI features: OpenAI's Responses API with structured outputs.

Only text goes out (never photos, names or email addresses; see app/services/ai.py), and
requests are sent with store=False so OpenAI keeps nothing.
"""

import json
import logging

from pydantic import BaseModel

from app.config import Settings

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 1500


class OpenAiWriter:
    def __init__(self, api_key: str, model: str, timeout: float):
        from openai import OpenAI

        self.model = model
        self._client = OpenAI(api_key=api_key, timeout=timeout, max_retries=1)

    def write[T: BaseModel](self, task: str, instructions: str, facts: dict, output_type: type[T]) -> T:
        """The model's answer for `task`, shaped as `output_type`. Raises on any failure."""
        response = self._client.responses.parse(
            model=self.model,
            instructions=instructions,
            input=json.dumps(facts, ensure_ascii=False),
            text_format=output_type,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            store=False,
        )
        if response.output_parsed is None:  # e.g. the model refused
            raise RuntimeError(f"No structured output for {task}")
        return response.output_parsed


def load_writer(settings: Settings) -> OpenAiWriter | None:
    """The configured writer, or None when no API key is set (AI features are then hidden)."""
    if settings.openai_api_key is None:
        logger.info("No OpenAI API key; AI features are off.")
        return None
    logger.info("AI features use OpenAI model %s", settings.openai_model)
    return OpenAiWriter(settings.openai_api_key.get_secret_value(), settings.openai_model, settings.openai_timeout_seconds)

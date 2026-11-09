"""Test doubles."""

from app.analysis.classifier import CategoryInfo, Prediction

CATEGORIES = [("aphids", "Aphids"), ("whiteflies", "Whiteflies"), ("mealybugs", "Mealybugs")]


class FakeClassifier:
    """Stands in for the trained model: answers with preset probabilities (and, optionally, a
    familiarity) and records each call."""

    def __init__(
        self,
        probabilities=(0.8, 0.15, 0.05),
        threshold=0.6,
        version="test-model-1",
        error=None,
        familiarity=None,
        familiarity_threshold=None,
    ):
        self.version = version
        self.threshold = threshold
        self.familiarity_threshold = familiarity_threshold
        self.categories = [CategoryInfo(key=key, name=name) for key, name in CATEGORIES]
        self._probabilities = list(probabilities)
        self._familiarity = familiarity
        self._error = error
        self.calls = []

    def predict(self, image):
        self.calls.append(image.size)
        if self._error is not None:
            raise self._error
        return Prediction(probabilities=list(self._probabilities), familiarity=self._familiarity)


# What the fake OpenAI model answers for each task, unless a test gives its own.
WRITER_OUTPUTS = {
    "plant_report": {
        "summary": "Aphids were found once on this lemon tree.",
        "timeline": [{"date": "2026-09-20", "text": "Green insects under the new leaves; Nabta suggested aphids."}],
        "open_items": [],
        "next_steps": [{"text": "Check the soft new growth each week.", "pest_key": "aphids"}],
    },
    "assessment_draft": {"message": "These look like aphids on the new growth."},
    "pest_answer": {
        "answer": "On soft new shoots and under leaves.",
        "covered_by_guide": True,
        "suggest_specialist": False,
    },
}


class FakeWriter:
    """Stands in for the OpenAI model: answers each task with preset output and records what it
    was sent, so tests can check exactly what would leave Nabta."""

    def __init__(self, outputs=None, error=None, model="test-llm"):
        self.model = model
        self._outputs = {**WRITER_OUTPUTS, **(outputs or {})}
        self._error = error
        self.requests = []

    def write(self, task, instructions, facts, output_type):
        self.requests.append({"task": task, "instructions": instructions, "facts": facts})
        if self._error is not None:
            raise self._error
        return output_type.model_validate(self._outputs[task])

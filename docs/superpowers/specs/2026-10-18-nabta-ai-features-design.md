# Nabta — AI features (OpenAI)

- **Date:** 2026-10-18
- **Status:** Built 2026-10-18; waiting for an API key to be tried against the real model. The team asked for "an AI feature" built on an LLM, chose OpenAI with the model `gpt-6-luna`, and asked for all three suggestions below. Decisions marked **(Claude's call)** can be changed.

## Why, and where an LLM helps

The trained pest model stays responsible for identification: it is evaluated, runs locally and never sends photos anywhere (Sprint 2 design §1). An LLM adds value where *language* is the product:

1. **Plant report (growers).** Turns a plant's history into a short, readable report. This is also the start of the charter's "summaries" story (US21).
2. **Draft assessment (specialists).** Drafts the message to the grower from the case. The specialist always edits and sends it themselves.
3. **Ask about this pest (any signed-in user).** Answers questions using **only** the pest's reviewed reference page.

## Guardrails (charter R05, NFR06, NFR14)

- **Text only.** Photos, names and email addresses are never sent. The model gets plant type and location, dates, notes, Nabta's results, the conversation (authors as "grower" and "specialist") and the pest pages' reviewed content. A backend test checks that names and emails never appear in what is sent.
- **Grounded.**
  - **Instructions:** the model may use only the facts it is given. It must never name pesticides, products or doses, or invent treatments. When something isn't covered, it says so and points to a specialist.
  - **Plant report:** next steps must cite one of the pest pages it was given.
  - **Pest answers:** they say whether the guide covered the question.
- **Labelled.** Everything AI-written shows "Written by AI (gpt-6-luna). It can be wrong: check with a specialist." Specialist drafts are shown as a draft to use or discard, never sent automatically.
- **OpenAI keeps nothing.** Requests are sent with `store=false`. Before a first report, the screen says that the plant's records are sent to OpenAI.
- **Optional.** Without `NABTA_OPENAI_API_KEY` the AI parts of the screens don't appear, and the endpoints answer 503 `ai_unavailable`. An OpenAI error or timeout answers 503 `ai_failed`, and the screen offers **Try again**.

## How it's built

- **Backend.** `app/ai/` wraps the official `openai` SDK and uses the Responses API with structured outputs (`responses.parse` with a Pydantic schema). The model and the key come from settings (`NABTA_OPENAI_MODEL`, default `gpt-6-luna`). Tests inject a fake writer in place of OpenAI, as they do for the pest model.
- **Plant reports are kept** (Claude's call): one row per report, with the model name and time, so reopening a report costs nothing and shows who wrote it and when (as NFR13 does for analyses). Drafts and answers aren't kept.
- **Endpoints:**
  - `GET /api/ai`: whether AI is on, and the model.
  - `GET` and `POST /api/plants/{id}/report`: the plant's owner only.
  - `POST /api/specialist/cases/{id}/draft`: the assigned specialist, open cases only.
  - `POST /api/pests/{key}/questions`: any signed-in user; questions up to 300 characters.
- **Screens.**
  - A **Plant report** page (`/plants/:id/report`), opened from the plant page, with print styles (Claude's call: "reports" suggests something to print or share).
  - **Draft with AI** in the specialist's assessment form. The draft appears in a box with **Use this draft** or **Discard**; it never overwrites what the specialist typed.
  - **Ask about this pest** on each pest page.

## Not in scope

Identification by an LLM, sending photos, free-form chat, and storing questions and answers.

# Nabta

Insect pest identification and specialist review — SE499 Senior Project.

This repository holds Sprints 1 and 2 of the charter (§16.1–16.2, stories US01–US16):

- **Sprint 1, application foundation:** a public home page, separate grower and plant specialist accounts, plant profiles and photo observations.
- **Sprint 2, identification and review:** Nabta suggests which pest a photo shows, with a confidence or an honest "unclear". Growers can compare their photo with reference photos and ask a plant specialist, who reviews the case, asks questions and sends an assessment.

The designs, including the API contracts, are in [docs/superpowers/specs/](docs/superpowers/specs/). Read [the Sprint 1 design](docs/superpowers/specs/2026-09-23-nabta-sprint1-design.md) first, then [the Sprint 2 design](docs/superpowers/specs/2026-10-18-nabta-sprint2-design.md).

| Part | Stack |
| --- | --- |
| `frontend/` | React 19 + Vite (JavaScript), Tailwind CSS, React Router, TanStack Query |
| `backend/` | FastAPI (Python 3.13), SQLAlchemy + Alembic, SQLite; serves the pest model with onnxruntime |
| `ml/` | PyTorch, BioCLIP and scikit-learn: trains, evaluates and exports the pest model ([ml/README.md](ml/README.md)) |

## Prerequisites

- Node.js 22.22 or newer (tested with 24)
- Python 3.13

## First-time setup

**Backend** (from `backend/`):

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head              # creates or updates storage/nabta.db
```

**Pest model.** The model files are too large for git. Build them with the steps in [ml/README.md](ml/README.md); the last step installs them in `backend/models/nabta-pest/`. Without a model, everything else works, and identification answers "isn't available right now".

**Demo data** (optional, from `backend/`, after the model is installed):

```bash
python -m app.cli seed-demo           # demo accounts, plants, photos, suggestions and reviews
python -m app.cli seed-demo --reset   # rebuild the demo grower's data (other accounts untouched)
```

**Frontend** (from `frontend/`):

```bash
npm install
```

## Running

Start both servers, each in its own terminal:

```bash
# backend/ (virtualenv active)
uvicorn app.main:app --reload --port 8000

# frontend/
npm run dev
```

Then open http://localhost:5173. The Vite dev server forwards `/api` to FastAPI, so the browser only ever talks to one address.

Interactive API documentation is at http://localhost:8000/docs.

To try the app on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the "Network" address it prints.

### Demo accounts

After `seed-demo`, both accounts use the password `NabtaDemo2026`:

| Email | Role | What's there |
| --- | --- | --- |
| grower@example.com | Grower | Five plants with real insect photos and Nabta's suggestions; three reviews: one answered, one with a question waiting, one waiting for a specialist |
| specialist@example.com | Plant specialist | Two cases already taken and one new case in the review queue |

The demo photos are from the IP102 test split, which the model never trained on (credits in `backend/content/demo/demo.json`).

### Roles

The sign-up and sign-in screens have a **Grower / Plant specialist** picker. Each role is its own account. If you sign in with the other role's picker selected, the screen says so and offers to switch.

The team can also create a specialist from `backend/`:

```bash
python -m app.cli create-specialist --email noura@example.com --name "Dr Noura"
```

The command asks for the password twice. `--password` sets it directly instead.

### AI features (optional)

Three features are written by an OpenAI model (`gpt-6-luna` by default):
- a **plant report** on a plant's insect history, which can be printed
- **Draft with AI** for a specialist's assessment message
- **Ask about this pest** on each pest page

They stay hidden until you add a key. Copy `backend/.env.example` to `backend/.env`, set `NABTA_OPENAI_API_KEY`, and restart the backend. Only text is sent to OpenAI, never photos, names or email addresses, and OpenAI is asked not to store it. Everything the AI writes is labelled as AI-written. Answers come only from Nabta's own records and the reviewed pest pages. The design is in [docs/superpowers/specs/2026-10-18-nabta-ai-features-design.md](docs/superpowers/specs/2026-10-18-nabta-ai-features-design.md).

### Pest reference content

The pest guide's descriptions and reference photos live in `backend/content/pests/catalog.json`. Each entry cites its source (UC IPM, or USDA APHIS for fruit flies) and starts as "Awaiting specialist review". When a plant specialist on the team has checked an entry, set its `review` to `{"status": "reviewed", "reviewed_by": "Name", "reviewed_on": "YYYY-MM-DD"}`. The app refuses to start if an entry is incomplete.

### Password-reset emails

Without SMTP settings, emails are **printed in the backend terminal**. Copy the reset link from there. To send real email, copy `backend/.env.example` to `backend/.env` and fill in the `NABTA_SMTP_*` values.

## Tests

```bash
# backend/
pytest                 # API, access control, photos, review cases, migrations, CLI, and the real model when installed

# frontend/
npm test               # page flows against a fake API (Vitest + Testing Library + MSW)
npm run lint
npm run build

# ml/
pytest                 # categories, data selection, duplicates, calibration, metrics, preprocessing parity
```

## Project layout

```
backend/
  app/            routers (HTTP) → services (logic) → models (database); analysis/ loads the pest model
  alembic/        database migrations: add one for every model change
  content/        pest reference content and demo photos (versioned like code)
  models/         the installed pest model (not in git)
  tests/          pytest suite
  storage/        nabta.db + uploaded photos (not in git)
frontend/
  src/api/        one module per API resource
  src/auth/       signed-in state and route guards
  src/components/ shared UI (buttons, fields, layout, notifications bell)
  src/features/   one folder per area: auth, dashboard, plants, observations, analysis, pests, reviews, specialist, account
  src/i18n/       all interface text (en.json); Arabic is added here in Sprint 3
ml/               training, evaluation and export of the pest model; reports/ holds the results
docs/             design specs
```

## Changing the database

1. Edit the models in `backend/app/models/`.
2. From `backend/`, run `alembic revision --autogenerate -m "describe the change"`.
3. Review the generated file in `alembic/versions/`, then run `alembic upgrade head`.

`tests/test_migrations.py` fails if the models and the migrations drift apart.

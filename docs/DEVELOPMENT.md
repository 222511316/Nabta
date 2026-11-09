# Nabta developer guide

Everything needed to set up, run, test and change Nabta. For an overview of the project, see the [README](../README.md).

Nabta holds all three sprints of the charter (§16, stories US01–US24):

- **Sprint 1, application foundation:** a public home page, separate grower and plant specialist accounts, plant profiles and photo observations.
- **Sprint 2, identification and review:** Nabta suggests which pest a photo shows, with a confidence or an honest "unclear". Growers can compare their photo with reference photos and ask a plant specialist, who reviews the case, asks questions and sends an assessment.
- **Sprint 3, guidance, follow-up and release:**
  - non-chemical "What you can do" steps on each pest page
  - tasks with in-app reminders, and dated notes on each plant
  - a side-by-side photo comparison on a date timeline
  - search, and a "Needs attention" summary on the dashboard
  - deleting single records or the whole account, and a separate research-consent switch
  - the whole app in Arabic (right to left) as well as English
  - browser tests across Chromium, Firefox and WebKit, and a Dockerfile for deployment

The designs, including the API contracts, are in [docs/superpowers/specs/](superpowers/specs/). Read [the Sprint 1 design](superpowers/specs/2026-09-23-nabta-sprint1-design.md) first, then [Sprint 2](superpowers/specs/2026-10-18-nabta-sprint2-design.md) and [Sprint 3](superpowers/specs/2026-10-27-nabta-sprint3-design.md). Deployment is in [docs/DEPLOY.md](DEPLOY.md). [docs/CHARTER_ALIGNMENT.md](CHARTER_ALIGNMENT.md) checks every charter requirement against the prototype and lists what the team still has to do.

| Part | Stack |
| --- | --- |
| `frontend/` | React 19 + Vite (JavaScript), Tailwind CSS, React Router, TanStack Query |
| `backend/` | FastAPI (Python 3.13), SQLAlchemy + Alembic, SQLite; serves the pest model with onnxruntime |
| `ml/` | PyTorch, BioCLIP and scikit-learn: trains, evaluates and exports the pest model ([ml/README.md](../ml/README.md)) |

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

**Pest model.** The model files are too large for git. Build them with the steps in [ml/README.md](../ml/README.md); the last step installs them in `backend/models/nabta-pest/`. Without a model, everything else works, and identification answers "isn't available right now".

**Demo data** (optional, from `backend/`, after the model is installed):

```bash
python -m app.cli seed-demo           # demo accounts, plants, photos, suggestions, reviews, tasks and notes
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
| grower@example.com | Grower | Five plants with real insect photos and Nabta's suggestions; three reviews: one answered, one with a question waiting, one waiting for a specialist; tasks that are overdue, due today, coming up, undated and done; a few dated notes |
| specialist@example.com | Plant specialist | Two cases already taken and one new case in the review queue |

The demo photos are from the IP102 test split, which the model never trained on (credits in `backend/content/demo/demo.json`).

### Roles

The sign-up and sign-in screens have a **Grower / Plant specialist** picker. Each role is its own account. If you sign in with the other role's picker selected, the screen says so and offers to switch.

**Only specialists the Nabta team has approved see review cases** (charter FR03, FR12, NFR05, NFR06). A specialist who signs up on the website is *pending*: they can sign in and manage their account, see "Awaiting approval" instead of the review queue, and the server answers every case request with `403 specialist_pending`. The team approves accounts from `backend/` (there is no admin role or admin screen):

```bash
python -m app.cli list-pending-specialists                       # names and emails only
python -m app.cli approve-specialist --email huda@example.com
python -m app.cli revoke-specialist --email huda@example.com      # back to pending (--release-cases returns their open cases to the queue)
```

The team can also create an already-approved specialist:

```bash
python -m app.cli create-specialist --email noura@example.com --name "Dr Noura"
```

The command asks for the password twice. `--password` sets it directly instead. When an older database is upgraded, existing specialist accounts start pending; approve the team's own with `approve-specialist`.

### AI features (switched off in the assessed release)

**The assessed release runs without an OpenAI API key, so these features are off**: their buttons and links are hidden, opening the report page shows "Plant reports aren't available", and the AI endpoints answer `503 ai_unavailable` without contacting OpenAI. They are outside the charter; the code is kept for later. Do not set `NABTA_OPENAI_API_KEY` for the assessed release.

Three features are written by an OpenAI model (`gpt-6-luna` by default):
- a **plant report** on a plant's insect history, which can be printed
- **Draft with AI** for a specialist's assessment message
- **Ask about this pest** on each pest page

They stay hidden until you add a key. Copy `backend/.env.example` to `backend/.env`, set `NABTA_OPENAI_API_KEY`, and restart the backend. They write in the language the user has chosen. Only text is sent to OpenAI, never photos, names or email addresses, and OpenAI is asked not to store it. Everything the AI writes is labelled as AI-written. Answers come only from Nabta's own records and the reviewed pest pages. The design is in [docs/superpowers/specs/2026-10-18-nabta-ai-features-design.md](superpowers/specs/2026-10-18-nabta-ai-features-design.md).

### Pest reference content

The pest guide's descriptions and reference photos live in `backend/content/pests/catalog.json`. Each entry cites its source (UC IPM, or USDA APHIS for fruit flies) and starts as "Awaiting specialist review". When a plant specialist on the team has checked a page, record it from `backend/`, then restart the backend:

```bash
python -m app.cli review-content --by "Dr Noura Saad" --pest aphids   # --pest is repeatable
python -m app.cli review-content --by "Dr Noura Saad" --all
```

The page then shows "Reviewed by" with the name and date. The app refuses to start if an entry is incomplete.

### Arabic and English

The language switch is in the header, on the home page and on the sign-in screens; the choice is remembered in the browser. Interface text is in `frontend/src/i18n/locales/` (`en.json`, `ar.json`), and a test fails if a string is missing from either. Pest content has its Arabic version beside the English in `catalog.json`.

The Arabic interface text and pest content were translated by AI and are marked **awaiting review by a native-speaking team member**. The pest pages say so in Arabic until the review is recorded with `python -m app.cli review-content --by "Name" --translation ar`.

### Growers' photos for research

Growers who switch on research consent (Account settings) agree to their photos being used to test the model. Only the team's commands take photos out of the app, and only from those growers. They copy the photo, its date and the insect identified, and never the grower's name, email, plants or notes. From `backend/`:

```bash
python -m app.cli export-research-photos --out D:\nabta-collected      # outside the repository
python -m app.cli evaluate-collected --set D:\nabta-collected --report ..\ml\reports\collected.md
```

The export takes photos a specialist has identified in a review. `--include-unchecked` adds the rest with an empty `category` for a reviewer to fill in. Fill in the `conditions` column (for example "outdoors, phone, daylight") before evaluating. Running the export again removes photos whose grower has since switched consent off, and keeps what you typed. The evaluation uses the installed model with the app's own "unclear" rule, and reports apart from the benchmark (charter §8).

### Password-reset emails

The email is in the language of the screen it was requested from. Without SMTP settings, emails are **printed in the backend terminal**. Copy the reset link from there. To send real email, copy `backend/.env.example` to `backend/.env` and fill in the `NABTA_SMTP_*` values.

## Tests

```bash
# backend/
pytest                 # API, access control, photos, review cases, migrations, CLI, and the real model when installed
pytest -m real_ai      # only on purpose: calls the paid OpenAI API (left out of the default run)

# frontend/
npm test               # page flows against a fake API (Vitest + Testing Library + MSW)
npm run lint
npm run build
npm run e2e            # the real app in Chromium, Firefox and WebKit, at 390 px and 1366 px
```

`npm run e2e` builds the frontend and starts the backend on port 8100 (`e2e/server.mjs`) with a fresh database in a temporary folder, the demo data and the installed pest model, with the AI features off. The browser tests (`e2e/*.spec.js`) cover the grower journey, the specialist review journey, specialist approval, AI switched off, and accessibility (axe-core, WCAG 2.1 A and AA, in English and Arabic, plus keyboard focus). Every test signs up its own throwaway accounts. The first time, install the browsers with `npx playwright install chromium firefox webkit`. `npm run e2e:report` opens the last report; `e2e-results/` holds JSON and JUnit results.

```bash

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
  src/features/   one folder per area: auth, dashboard, plants, observations, analysis, pests, reviews, specialist,
                  account, tasks, notes, compare, search, ai
  src/i18n/       all interface text, in English (en.json) and Arabic (ar.json)
  e2e/            browser tests (Playwright)
ml/               training, evaluation and export of the pest model; reports/ holds the results
docs/             design specs and deployment notes
Dockerfile        the whole app in one container (docs/DEPLOY.md)
```

## Changing the database

1. Edit the models in `backend/app/models/`.
2. From `backend/`, run `alembic revision --autogenerate -m "describe the change"`.
3. Review the generated file in `alembic/versions/`, then run `python -m app.cli backup-db` and `alembic upgrade head`.

`tests/test_migrations.py` fails if the models and the migrations drift apart, and if upgrading, downgrading or upgrading again a database that already holds records loses any row or link.

Migrations on SQLite run with foreign keys off for that one connection, in one transaction, and are undone if `PRAGMA foreign_key_check` finds a broken link (`alembic/env.py`). Before that, a batch table rebuild of `users` deleted every plant, observation and review on upgrade (supervisor review DEF-02). `python -m app.cli restore-db --from <backup>` puts a backup back.

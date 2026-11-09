# Nabta

Insect pest identification and specialist review — SE499 Senior Project.

This repository holds **Sprint 1: Application Foundation** (charter §16.1, stories US01–US08). There's a public home page. Growers and plant specialists sign up with their own accounts. Growers manage plant profiles and save photo observations, and specialists have their own protected workspace.

The design, including the full API contract, is in [docs/superpowers/specs/2026-09-23-nabta-sprint1-design.md](docs/superpowers/specs/2026-09-23-nabta-sprint1-design.md).

| Part | Stack |
| --- | --- |
| `frontend/` | React 19 + Vite (JavaScript), Tailwind CSS, React Router, TanStack Query |
| `backend/` | FastAPI (Python 3.13), SQLAlchemy + Alembic, SQLite |

## Prerequisites

- Node.js 22.22 or newer (tested with 24)
- Python 3.13

## First-time setup

**Backend** (from `backend/`):

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head              # creates storage/nabta.db
python -m app.cli seed-demo       # optional demo accounts and plants
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

| Email | Role |
| --- | --- |
| grower@example.com | Grower, with three plants |
| specialist@example.com | Plant specialist |

### Roles

The sign-up and sign-in screens have a **Grower / Plant specialist** picker. Each role is its own account. If you sign in with the other role's picker selected, the screen says so and offers to switch.

The team can also create a specialist from `backend/`:

```bash
python -m app.cli create-specialist --email noura@example.com --name "Dr Noura"
```

The command asks for the password twice. `--password` sets it directly instead.

### Password-reset emails

Without SMTP settings, emails are **printed in the backend terminal**. Copy the reset link from there. To send real email, copy `backend/.env.example` to `backend/.env` and fill in the `NABTA_SMTP_*` values.

## Tests

```bash
# backend/
pytest                 # API, access control, photos, migrations, CLI

# frontend/
npm test               # page flows against a fake API (Vitest + Testing Library + MSW)
npm run lint
npm run build
```

## Project layout

```
backend/
  app/            routers (HTTP) → services (logic) → models (database)
  alembic/        database migrations — add one for every model change
  tests/          pytest suite
  storage/        nabta.db + uploaded photos (not in git)
frontend/
  src/api/        one module per API resource
  src/auth/       signed-in state and route guards
  src/components/ shared UI (buttons, fields, layout)
  src/features/   one folder per area: auth, dashboard, plants, observations, account, specialist
  src/i18n/       all interface text (en.json); Arabic is added here in Sprint 3
docs/             design spec
```

## Changing the database

1. Edit the models in `backend/app/models/`.
2. From `backend/`, run `alembic revision --autogenerate -m "describe the change"`.
3. Review the generated file in `alembic/versions/`, then run `alembic upgrade head`.

`tests/test_migrations.py` fails if the models and the migrations drift apart.

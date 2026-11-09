# How to Run Nabta

## 0. Install these first (one time only)

- **Python 3.13** — https://www.python.org/downloads/
  - Windows: tick **"Add Python to PATH"** during install.
- **Node.js 22 or newer** — https://nodejs.org/

You need **two terminals** open: one for the backend, one for the frontend.

---

## 1. Backend — first time only

Open a terminal in the `Nabta` folder.

**Windows**

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.cli seed-demo
```

**Mac**

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.cli seed-demo
```

> If Windows says "running scripts is disabled", run this once in PowerShell, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 2. Frontend — first time only

Open a **second** terminal in the `Nabta` folder (same on Windows and Mac):

```
cd frontend
npm install
```

---

## 3. Start the app (every time)

**Terminal 1 — backend**

Windows:
```
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Mac:
```
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend** (same on Windows and Mac)
```
cd frontend
npm run dev
```

## 4. Open it

Go to **http://localhost:5173** in your browser.

Demo logins (password for both: `NabtaDemo2026`):

- Grower: `grower@example.com`
- Specialist: `specialist@example.com`

Use the **العربية / English** button at the top to switch language.

## Already set up before? Update first

After pulling new changes, in the backend terminal (virtualenv active):

```
pip install -r requirements-dev.txt
python -m app.cli backup-db
alembic upgrade head
python -m app.cli seed-demo --reset
```

**Always run `backup-db` before `alembic upgrade head` on a database that holds real records.** It writes a
timestamped, self-contained copy to `backend/storage/backups/` (the write-ahead log is folded in first and the copy
is integrity-checked) and prints the row counts. Photos are not in the database; copy `backend/storage/photos/` too
if you want a full backup.

To undo an upgrade, stop the backend, then:

```
python -m app.cli restore-db --from storage/backups/<the file backup-db printed>.db
```

`restore-db` asks before replacing anything, keeps the database it replaces in `storage/backups/`, and checks that
every table matches the backup afterwards.

> Why: upgrading a Sprint 2 database with the Sprint 3 code used to delete plants, observations and reviews
> (supervisor review DEF-02). SQLite changes a table by copying it and dropping the old one, and with foreign keys
> on, dropping `users` deleted everything linked to it. Migrations now run with foreign keys off for that one
> connection, in one transaction, and are undone if `PRAGMA foreign_key_check` finds a broken link.

**After this update, existing specialist accounts are pending** (see "Specialist accounts" below). Approve your
own team's specialists once:

```
python -m app.cli list-pending-specialists
python -m app.cli approve-specialist --email specialist@example.com
```

and in the frontend terminal:

```
npm install
```

`--reset` rebuilds only the demo grower's data, so the demo shows the newest features (tasks, notes).

## 5. Stop it

Press **Ctrl + C** in each terminal.

---

## Specialist accounts (approval by the team)

Only specialists the Nabta team has approved can see review cases (charter FR03, FR12, NFR05, NFR06).

- **Sign-up on the website** with "Plant specialist" creates a **pending** account. The person can sign in and
  manage their account, and sees "Awaiting approval" instead of the review queue. The server refuses every case,
  photo and queue request with `403 specialist_pending`.
- **`create-specialist`** (the team's own accounts) creates an **approved** account straight away. So does
  `seed-demo` for the demo specialist.

From `backend/` (virtualenv active):

```
python -m app.cli list-pending-specialists                     # names and emails only
python -m app.cli approve-specialist --email someone@example.com
python -m app.cli revoke-specialist --email someone@example.com  # back to pending
python -m app.cli revoke-specialist --email someone@example.com --release-cases  # and return their open cases to the queue
```

There is no admin role and no admin screen: approval is a team command. Checking professional qualifications is
out of scope; the team approves people it knows.

When a database from before this change is upgraded, every existing specialist account becomes pending (the safe
default). Approve the team's own accounts with `approve-specialist`.

## AI features are switched off in the assessed release

The plant report, "Draft with AI" and "Ask about this pest" are written by OpenAI and are outside the charter. The
assessed release runs **without** an OpenAI API key, so they are off: their buttons and links are hidden, and their
endpoints answer `503 ai_unavailable` without contacting OpenAI. Do not set `NABTA_OPENAI_API_KEY` in `backend/.env`
for the assessed release. `tests/test_real_ai.py` (which calls the real OpenAI API) is left out of the default `pytest`
run; run it on purpose with `pytest -m real_ai`.

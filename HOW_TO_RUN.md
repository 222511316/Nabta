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

## 5. Stop it

Press **Ctrl + C** in each terminal.

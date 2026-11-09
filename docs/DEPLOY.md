# Deploying Nabta

Nabta runs as one service. The FastAPI app serves the API under `/api` and the built frontend on every other path, so the browser talks to a single address and the session cookie stays first-party.

The [Dockerfile](../Dockerfile) at the repository root builds that service. The team still has to choose where to host it; the charter's hosting budget is SAR 200 (§7).

## What the host needs

| Need | Why |
| --- | --- |
| A container service that builds from a Dockerfile (for example Render, Railway, Fly.io, or a small VPS with Docker) | Runs the image |
| A **persistent disk** mounted at `/data` | Holds the SQLite database and the uploaded photos. Without it, every redeploy loses all data |
| **HTTPS** on the public address | Sign-in cookies are marked `Secure` in the image, so they only travel over HTTPS. Most hosts provide HTTPS automatically |
| About 1 GB of memory | The pest model (onnxruntime) loads at start-up |
| One instance only | SQLite is a single file on one disk; don't scale out to several copies |

## 1. Put the pest model in place

The model files are not in git. Before building, `backend/models/nabta-pest/` must contain `model.onnx` and `model_card.json`. They are produced by the steps in [ml/README.md](../ml/README.md); the team's current copy is on the development machine.

Without the model, the app still runs, but identification answers "isn't available right now".

## 2. Build and try it locally

From the repository root:

```bash
docker build -t nabta .
docker run -p 8000:8000 -v nabta-data:/data -e NABTA_COOKIE_SECURE=false nabta
```

Open http://localhost:8000. `NABTA_COOKIE_SECURE=false` is only for this local try-out over plain HTTP. On the host, leave it unset; the image defaults to `true`.

On start, the container first backs up the database to `/data/backups/` if an upgrade is pending (`python -m app.cli backup-db --if-upgrade-pending`), then brings it up to date (`alembic upgrade head`), then serves on port 8000. Migrations run with SQLite foreign keys switched off for that one connection, in one transaction, and are undone if `PRAGMA foreign_key_check` finds any broken link, so upgrading never deletes existing records (supervisor review DEF-02).

## 3. Settings (environment variables)

Set these as the host's secrets or environment variables. Never commit them, and never bake them into the image.

| Variable | Value |
| --- | --- |
| `NABTA_FRONTEND_URL` | The public address, e.g. `https://nabta.example.com`. Used in password-reset emails |
| `NABTA_OPENAI_API_KEY` | **Leave unset for the assessed release.** The AI features (plant report, "Draft with AI", "Ask about this pest") are outside the charter and run switched off: without a key they are hidden and their endpoints answer `503 ai_unavailable` without contacting OpenAI (supervisor review OBS-06). Setting a key would turn them on |
| `NABTA_SMTP_HOST`, `NABTA_SMTP_PORT`, `NABTA_SMTP_USER`, `NABTA_SMTP_PASSWORD`, `NABTA_SMTP_FROM` | Optional. Without them, reset emails are only written to the log |

Already set in the image: `NABTA_STORAGE_DIR=/data`, `NABTA_DATABASE_URL=sqlite:////data/nabta.db`, `NABTA_FRONTEND_DIST=/app/frontend/dist`, `NABTA_COOKIE_SECURE=true`.

## 4. First accounts

Open a shell in the running container (most hosts offer one) and run, from `/app/backend`:

```bash
python -m app.cli create-specialist --email name@example.com --name "Full name"   # approved at once
python -m app.cli seed-demo        # optional: the demo accounts and records, for presentations
```

Growers sign up on the website. Specialists can sign up there too, but their account is **pending**: they can sign in and manage their account, and see no review cases until the team approves them (FR03, FR12; supervisor review OBS-14):

```bash
python -m app.cli list-pending-specialists             # names and emails only
python -m app.cli approve-specialist --email name@example.com
python -m app.cli revoke-specialist --email name@example.com [--release-cases]
```

## 5. Check the deployment

- `https://<address>/api/health` answers `{"status": "ok"}`.
- Sign in, add a plant and a photo, and see Nabta's suggestion.
- Switch to Arabic and back.

## Backups

Everything lives on the `/data` disk: `nabta.db` and the `photos/` folder.

- `python -m app.cli backup-db` writes a consistent, timestamped copy of the database (write-ahead log folded in, integrity-checked) to `/data/backups/`. The container does this by itself before any upgrade.
- To undo an upgrade: stop the app, then `python -m app.cli restore-db --from /data/backups/<file>.db`. The database being replaced is kept in `/data/backups/` too.
- Photos are not in the database: copy the `photos/` folder with it, while the app is stopped or quiet, to keep them in step.

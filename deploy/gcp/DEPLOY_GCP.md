# Deploying Nabta on Google Cloud (one Compute Engine VM)

**Status: deployed on 8 November 2026.** Live at **https://nabta.duckdns.org**. The first address, https://34-18-217-81.sslip.io, also still works.
- Image `nabta:v1` was built by Cloud Build (build `32c80a88-…`, SUCCESS, 2 min 35 s).
- The one-time IAM role in step 1 was granted by the project owner the same day.
- Checked from outside: `/api/health` returns 200 with a valid certificate, HTTP redirects to HTTPS, the demo grower
  sees 5 plants with their photos, Arabic is right to left, and AI is off. Screenshots are in
  `Review_Fixes_Evidence/deploy_gcp/`.

Nabta runs as the existing Docker image (repository `Dockerfile`), with **no code changes**. Caddy sits in front of
it to provide HTTPS. The SQLite database and the photos live on the VM's persistent disk in `/srv/nabta`.

| Item | Value |
| --- | --- |
| Google account / project | The team's Google account and its Google Cloud project, written `PROJECT_ID` (and `PROJECT_NUMBER`) below; the real values are kept out of the repository |
| Region / zone | `me-central1` (Doha) / `me-central1-a` |
| VM | `nabta-vm`, e2-small (2 vCPU shared, 2 GB RAM), Ubuntu 24.04 LTS, 20 GB balanced disk, Docker and Compose installed by the startup script |
| Static IP | `nabta-ip` = 34.18.217.81 |
| Public address | **https://nabta.duckdns.org**: a free DuckDNS name, managed at duckdns.org (signed in with the team's account), with its IP set to 34.18.217.81. https://34-18-217-81.sslip.io also works. Caddy gets a Let's Encrypt certificate for each name and renews it automatically |
| Firewall | `nabta-allow-web`: TCP 80 and 443 to VMs tagged `nabta-web`. SSH (22) through the project's default rule |
| Image | `me-central1-docker.pkg.dev/PROJECT_ID/nabta/nabta:v1` (Artifact Registry repository `nabta`) |
| Files on the VM | `/opt/nabta/docker-compose.yml`, `/opt/nabta/Caddyfile`, `/opt/nabta/nabta.env` (copies of this folder) |
| Data on the VM | `/srv/nabta/nabta.db` and `/srv/nabta/photos/`, owned by uid 1000 (the image's `nabta` user) |
| Estimated cost | about $15–20 a month (VM, static IP, disk). Stop the VM when it isn't needed (see below) |

All commands below run on your Mac with `export CLOUDSDK_ACTIVE_CONFIG_NAME=nabta`. That gcloud configuration uses
the account and project above, and your default gcloud configuration is not touched. Replace `PROJECT_ID` and
`PROJECT_NUMBER` with your project's values. On the VM, `docker-compose.yml` reads the project ID from `GCP_PROJECT_ID` in
`/opt/nabta/.env`.

## 1. Build the image (Cloud Build)

From `Application/Final Codebase/`:

```bash
gcloud builds submit --tag me-central1-docker.pkg.dev/PROJECT_ID/nabta/nabta:v1 --timeout=40m .
```

`.gcloudignore` decides what is uploaded: the code and the pest model (about 360 MB). The database, `.env`,
`node_modules`, the venv, `ml/` and `docs/` are left out.

**One-time permission:** Cloud Build in this project runs as the default Compute service account. That account
needs the Cloud Build Builder role, which also lets the VM pull the image:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder --condition=None
```

## 2. Start it on the VM

```bash
gcloud compute ssh nabta-vm --zone me-central1-a
# on the VM:
gcloud auth configure-docker me-central1-docker.pkg.dev --quiet
cd /opt/nabta && sudo docker compose pull && sudo docker compose up -d
sudo docker compose logs -f nabta     # Ctrl+C to stop following
```

When the container starts it backs up the database if an upgrade is pending, runs `alembic upgrade head`, then
serves the app. Caddy obtains the certificate on the first HTTPS request.

## 3. Check

- https://nabta.duckdns.org/api/health answers `{"status":"ok"}`.
- Sign in, open a plant and a photo, and switch to Arabic. AI features stay off (no `NABTA_OPENAI_API_KEY`).

## Team commands on the server

```bash
cd /opt/nabta
sudo docker compose exec nabta python -m app.cli list-pending-specialists
sudo docker compose exec nabta python -m app.cli approve-specialist --email someone@example.com
sudo docker compose exec nabta python -m app.cli create-specialist --email name@example.com --name "Full name"
sudo docker compose exec nabta python -m app.cli backup-db          # writes to /srv/nabta/backups/
```

## Updating to a new version

Build with a new tag (for example `:v2`), change the tag in `docker-compose.yml` on the VM, then run
`sudo docker compose pull && sudo docker compose up -d`. The database is backed up automatically before any migration.

## Stopping and costs

- **Pause** (no VM charge; the disk and static IP still cost about $3–4 a month):
  `gcloud compute instances stop nabta-vm --zone me-central1-a`. Start it again with `... instances start ...`.
- **Remove everything:**
  - `gcloud compute instances delete nabta-vm --zone me-central1-a`
  - `gcloud compute addresses delete nabta-ip --region me-central1`
  - `gcloud compute firewall-rules delete nabta-allow-web`
  - `gcloud artifacts repositories delete nabta --location me-central1`

## Data that was deployed

The deployed database is the one in `Final Codebase/backend/storage/`: the Sprint 3 database, upgraded to
`0007_specialist_approval`, with the demo specialist approved. It holds 2 users, 5 plants, 8 observations and
32 photo files. Only the local browser sign-in sessions were cleared before upload.

The two accounts are the demo accounts. **Their password is published in the README**, so change both
passwords (Account → Change password) right after the site is up.

## The address (DuckDNS)

`nabta.duckdns.org` points at the static IP 34.18.217.81, which stays the same while the `nabta-ip` address is kept.
If the IP ever changes, update it at duckdns.org. To move to a bought domain, point its DNS A record at the IP,
add the name to the first line of `Caddyfile`, set `NABTA_FRONTEND_URL` in `nabta.env`, copy both files to
`/opt/nabta` on the VM and run `sudo docker compose up -d --force-recreate`.

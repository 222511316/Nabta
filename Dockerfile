# Nabta in one container: the FastAPI app serves the API and the built frontend.
# Build from the repository root:  docker build -t nabta .
# Run (data kept in a volume):      docker run -p 8000:8000 -v nabta-data:/data --env-file backend/.env nabta
# See docs/DEPLOY.md for HTTPS, secrets and the model file.

# 1. Build the frontend.
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. The API, with the frontend build beside it.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NABTA_STORAGE_DIR=/data \
    NABTA_DATABASE_URL=sqlite:////data/nabta.db \
    NABTA_FRONTEND_DIST=/app/frontend/dist \
    NABTA_COOKIE_SECURE=true
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# The pest model (backend/models/nabta-pest) is not in git: export or copy it in before building.
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --create-home nabta && mkdir -p /data && chown nabta /data
USER nabta
VOLUME /data
EXPOSE 8000
# Back up the database when an upgrade is pending (to /data/backups), bring it up to date, then serve.
# The platform's proxy terminates HTTPS.
CMD ["sh", "-c", "python -m app.cli backup-db --if-upgrade-pending && alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]

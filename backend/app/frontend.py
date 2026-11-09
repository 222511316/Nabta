"""Serves the built frontend (frontend/dist) from the API's own origin, for deployment.

One service then runs everything: /api/* is the API, every other path is the single-page
app, which does its own routing. In development the Vite server does this instead.
"""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.services.plants import not_found

logger = logging.getLogger(__name__)


def mount_frontend(application: FastAPI, dist: Path | None) -> None:
    index = dist / "index.html" if dist else None
    if index is None or not index.is_file():
        logger.info("No frontend build at %s; serving the API only.", dist)
        return
    root = dist.resolve()

    @application.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise not_found()  # an unknown API route stays a JSON 404, not the app
        if path:
            file = (root / path).resolve()
            if file.is_file() and root in file.parents:
                # Built assets have content hashes in their names, so they never change.
                cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "public, max-age=3600"
                return FileResponse(file, headers={"Cache-Control": cache})
        # Any other path is a page of the app (/plants/3, /tasks...): the app's router takes it.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

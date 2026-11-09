"""Refuses state-changing requests that a browser marks as coming from another website.

Browsers set Sec-Fetch-Site themselves and pages cannot forge it. Together with
SameSite=Lax cookies this blocks cross-site request forgery, while same-origin
callers (the app, the /docs page) and non-browser clients are unaffected.
"""

from starlette.types import ASGIApp, Receive, Scope, Send

from app.errors import error_response

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class RejectCrossSiteWrites:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE_METHODS:
            headers = dict(scope["headers"])
            if headers.get(b"sec-fetch-site") == b"cross-site":
                response = error_response(
                    403, "cross_site_request", "Requests from other websites are not allowed."
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

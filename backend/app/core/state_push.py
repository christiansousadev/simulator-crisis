"""push the fresh engine state to websocket clients right after every successful state-changing command"""

from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# the tick loop is the only other broadcaster, and it does not run while the game is paused -- so
# without this a paused player's acknowledge/triage/runbook/purchase/... succeeded server-side but
# the UI never saw the new state until the loop resumed
_MUTATING_METHODS = frozenset({"POST", "DELETE"})

# POSTs under /api that never touch engine state: the auditor chat only appends to a transcript row
_NON_MUTATING_SUFFIXES = ("/interview",)


def should_push_after(method: str, path: str, status_code: int) -> bool:
    """DECIDE WHETHER A FINISHED REQUEST WARRANTS A FRESH STATE FRAME -- ONLY A SUCCESSFUL
    (<400) POST/DELETE UNDER /api THAT ACTUALLY MUTATES THE ENGINE; FAILURES CHANGED NOTHING"""
    if method not in _MUTATING_METHODS or status_code >= 400:
        return False
    if not path.startswith("/api/"):
        return False
    return not path.endswith(_NON_MUTATING_SUFFIXES)


class PushStateAfterCommandMiddleware:
    """PURE ASGI MIDDLEWARE (NO BaseHTTPMiddleware, SO THE HANDLER KEEPS RUNNING IN THE REQUEST'S OWN
    TASK): THE FRAME IS BROADCAST JUST BEFORE THE RESPONSE HEADERS GO OUT, SO CLIENTS HAVE THE NEW
    STATE BY THE TIME THE REST CALL RESOLVES"""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in _MUTATING_METHODS:
            await self.app(scope, receive, send)
            return

        pushed = False

        async def send_wrapper(message: Message) -> None:
            nonlocal pushed
            if message["type"] == "http.response.start" and not pushed:
                pushed = True
                if should_push_after(scope["method"], scope["path"], message["status"]):
                    await _push_state(scope)
            await send(message)

        await self.app(scope, receive, send_wrapper)


async def _push_state(scope: Scope) -> None:
    """BROADCAST THE ENGINE'S CURRENT STATE; A BROADCAST PROBLEM MUST NEVER FAIL THE COMMAND ITSELF"""
    app: Any = scope.get("app")
    engine = getattr(getattr(app, "state", None), "engine", None)
    if engine is None or not engine.active_websockets:
        return
    try:
        await engine.broadcast_state()
        await engine.flush_pending_broadcasts()
    except Exception:
        # sockets that fail are already pruned inside the engine; anything else is best-effort
        pass

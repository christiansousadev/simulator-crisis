# Security Policy

IncidentZero is a portfolio/demo project — a single-operator crisis simulation game, not
production infrastructure. It intentionally documents its own security posture in detail rather
than glossing over it; the authoritative source is
[`audits/docs/01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md`, § 5](./audits/docs/01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md#5-security--isolation-boundaries).

## Known, accepted design boundaries (not bugs)

These are documented, deliberate scope limitations for a local/single-operator deployment, not
vulnerabilities waiting to be reported:

- **No authentication layer.** Every REST call and WebSocket connection is unauthenticated; there
  is no per-user identity, bearer token, or session cookie. See Document 01 § 5.2.
- **Permissive CORS.** `allow_origins=["*"]` combined with `allow_credentials=True`, appropriate
  for local development, not for a public multi-tenant deployment. See Document 01 § 5.1.
- **No rate limiting on the general API surface**, aside from a minimal in-process limiter on the
  LLM-backed AI Auditor interview endpoint specifically (`backend/app/api/v1/audits.py`), added
  because that endpoint has a real, metered cost behind it if `LLM_API_KEY` is configured.
- **Client-supplied `player_id`** scopes career/leaderboard records with no ownership proof
  beyond format/length validation — sufficient to stop garbage input, not identity spoofing on
  the global Hall of Fame. See `frontend/src/utils/playerId.ts`.

If you're deploying this beyond local/demo use, address the items above first — narrowing CORS to
an explicit origin allow-list and adding a real auth layer are the two with the most impact.

## Reporting a vulnerability

If you find something not already covered above — something that would matter even for a local
demo (e.g., a path traversal in report/interview file handling, a SQL injection, a way to corrupt
another session's data) — please open a
[GitHub issue](https://github.com/christiansousadev/simulator-crisis/issues/new) or, if you'd
rather not disclose it publicly first, reach out to the maintainer directly. There's no bug
bounty here — this is a solo portfolio project — but real findings are genuinely welcome and will
be credited.

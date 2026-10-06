# Security Policy

IncidentZero is a portfolio/demo project — a single-operator crisis simulation game, not
production infrastructure. It intentionally documents its own security posture in detail rather
than glossing over it; the authoritative source is
[`audits/docs/01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md`, § 5](./audits/docs/01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md#5-security--isolation-boundaries).

_Last reviewed: Outubro 2026, by reading the code and configuration against the statements below. This is a documentation review, not a penetration test._

## Known, accepted design boundaries (not bugs)

These are documented, deliberate scope limitations for a local/single-operator deployment, not
vulnerabilities waiting to be reported:

- **No authentication layer.** Every REST call and WebSocket connection is unauthenticated; there
  is no per-user identity, bearer token, or session cookie. See Document 01 § 5.3.
- **Permissive CORS.** `allow_origins=["*"]` combined with `allow_credentials=True`, appropriate
  for local development, not for a public multi-tenant deployment. See Document 01 § 5.3.
- **No rate limiting on the general API surface**, aside from a minimal in-process limiter on the
  LLM-backed AI Auditor interview endpoint specifically (`backend/app/api/v1/audits.py`), added
  because that endpoint has a real, metered cost behind it if `LLM_API_KEY` is configured.
- **One shared simulation.** The backend runs a single engine and a single live session
  (`incidentzero-alpha`). Every client that can reach the API sees the same state frames
  (including the audit ledger tail and the roster), can issue the same commands, and can
  re-point career attribution by connecting to `/ws/telemetry?player_id=...`. There is no
  per-client isolation and no WebSocket origin check. State is also pushed to all connected
  clients after every successful state-changing command, not only on ticks.
- **Optional AI Auditor (LLM) integration.** Disabled until `LLM_API_KEY` is set (the interview
  route answers `503` meanwhile). When enabled, the incident dossier and the player's messages are
  sent to whatever endpoint `LLM_API_BASE_URL` names, with the key as a Bearer token; there is no
  allow-list for that URL and no authentication in front of the route, so anyone who can reach
  the API can spend the configured key (bounded only by the in-process 10 calls / 60 s per-IP
  limiter and a 2,000-character message limit). A local OpenAI-compatible server that needs no
  authentication still requires a non-empty placeholder key to be switched on. Model output is
  treated as untrusted: the verdict is enum-checked and any money it proposes is re-clamped by the
  backend (`formulas.eligible_audit_adjustment`) and applied at most once. Interview transcripts
  and verdict caches are stored as plain JSON files under `audits/interviews/`; post-mortems under
  `audits/reports/`. Keep the key in the process environment, never in a committed file (see
  `.env.example`).
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

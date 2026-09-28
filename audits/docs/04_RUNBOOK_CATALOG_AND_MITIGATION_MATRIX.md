# Runbook Catalog and Mitigation Matrix

**Document ID:** IZ-OPS-04
**Classification:** Operational Reference / Compliance Package Exhibit D
**Source of truth:** `backend/app/engine/formulas.py::MITIGATION_CATALOG` (the single canonical definition, served verbatim by `GET /api/mitigations/catalog` and consumed by `SimulationEngine.apply_mitigation` via `formulas.find_mitigation`)

---

## 1. Full Catalog

| Action ID | Display Name | Category | Cost | TDI Delta | Resolve Speed Multiplier | Cooldown (ticks) | Description (as authored) |
|---|---|---|---|---|---|---|---|
| `rollback` | Rollback Canary | `deployment` | \$1,800.00 | −2 | 1.5× | 3 | Revert to last immutable stable container SHA. |
| `scale_replicas` | Spin Replicas (+4 Pods) | `infra` | \$3,200.00 | +1 | 1.2× | 4 | Horizontally scale compute pool to absorb traffic spikes. |
| `circuit_breaker` | Enable Circuit Breaker | `resilience` | \$800.00 | +3 | 1.1× | 5 | Shed non-critical traffic to protect database master. |
| `emergency_patch` | Hotfix Prod Live | `hotfix` | \$500.00 | +8 | 2.0× | 6 | Direct SSH hotfix. Instant cure, high technical debt. |

This is the complete and exhaustive catalog; no fifth entry, hidden action id, or admin-only runbook exists anywhere in the codebase. Every field above is a literal value from `MITIGATION_CATALOG` — none are derived or rounded for presentation.

---

## 2. As-Implemented Mechanics — What Each Field Actually Does

A rigorous audit distinguishes a field's *declared intent* from its *enforced behavior*. The following table records that distinction precisely, based on `SimulationEngine.apply_mitigation` (backend/app/engine/simulator.py):

| Field | Enforced by backend engine? | As-implemented effect |
|---|---|---|
| `cost` | **Yes.** | `apply_mitigation` rejects the call with `{"success": False, "error": "Insufficient budget runway"}` (surfaced as HTTP 400) if `self.budget < action["cost"]`; otherwise `self.budget -= action["cost"]` unconditionally. |
| `tech_debt_delta` | **Yes.** | `self.tech_debt = max(0, min(100, self.tech_debt + action["tech_debt_delta"]))` — clamped to the closed interval [0, 100] every time. |
| `resolve_speed_multiplier` | **No.** | This field is served to the frontend catalog response but is never read by `apply_mitigation`. Resolution is instantaneous and identical regardless of which runbook is fired: the target service's `status` is set directly to `"healthy"`, `latency_ms` is re-randomized to `[25, 60]`, and `error_rate` is reset to `0.0001`, on the same tick the action is invoked, for every runbook without exception. The multiplier is a defined-but-dormant field in the current release — it does not accelerate, delay, or otherwise differentiate remediation speed between runbooks today. |
| `cooldown_ticks` | **Yes, as of the server-side cooldown hardening pass.** | `apply_mitigation` now tracks `mitigation_last_fired_tick[action_id]` (global per action id, not per service) and rejects the call with `{"success": False, "error": "Runbook on cooldown: N tick(s) remaining"}` (HTTP 400) if fewer than `cooldown_ticks` have elapsed since that action id last fired successfully. `get_state_payload` now also serializes this map verbatim as `mitigation_cooldowns` on every `TICK_BROADCAST`. Following a second hardening pass, `MitigationsPanel.tsx` no longer tracks its own `firedAtTick` local state at all — it computes `cooldownProgress` directly from `telemetry.mitigation_cooldowns[actionId]` and `telemetry.tick`, the same values `apply_mitigation` itself enforces against, so the client's countdown can no longer desync from the server (the previous local-state version froze a button "on cooldown" indefinitely across a New Game / victory / bankruptcy restart, because `tick` reset to ~0 while the stale `firedAtTick` value did not — see this document's revision history). One known simplification remains: `mitigation_last_fired_tick` is not persisted to the database, so it does not survive a backend process restart (unlike `budget`/`tech_debt`/etc., see Document 01 §4 on the snapshot/resume path) — a restart mid-run resets every action's cooldown to "ready," and the client reflects that correctly since it now only ever mirrors the server's own value. |
| `category` | Presentational only. | Consumed exclusively by the frontend to group/label runbook cards (`Deployment`, `Compute`, `Resilience`, `Emergency Hotfix` display strings, localized per Document 01's i18n layer); it has no effect on engine behavior. |

**Presentation layer (as-implemented, Phase 2 War Room revision).** `MitigationsPanel.tsx`'s runbook cards were restyled from a light card register (`border-slate-200`/`bg-white`, with a `border-rose-200`/`bg-rose-50` variant for `emergency_patch`) to the tactical dark register shared with the rest of the dock (`border-slate-800`/`bg-slate-900/80`, and `border-rose-500/50`/`bg-rose-950/30` for the danger variant) — a purely cosmetic change with no effect on any field in the table above. The client-side `cooldownTicks` countdown itself continues to be rendered by `CooldownButton`'s radial conic-gradient sweep (`.cooldown-ring`, `index.css`), whose color was recalibrated from `rgba(15,23,42,0.7)` to a near-black `rgba(2,6,23,0.78)` specifically so the "still on cooldown" wedge remains legible as it recedes against the new dark card background. Separately, firing any runbook now also triggers `playKeyboardClatter()` (`frontend/src/utils/sound.ts`) — a synthesized burst of eight randomized-frequency square-wave clicks played alongside the existing `playCashSound()` cue — as an additional, purely auditory cue with no bearing on the enforced mechanics recorded in this table.

**Governance implication (superseded).** Cooldown is now server-enforced (see the `cooldown_ticks` row above), so a scripted client calling `POST /api/mitigations/execute` directly can no longer fire the same runbook every tick — the previous version of this section, which recorded that as an open control gap, no longer applies. The *financial* and *technical-debt* consequences of rapid repeated firing (§ 3 below) remain the primary economic guardrail *within* the cooldown window itself.

**Rejection messaging (superseded).** `MitigationsPanel.tsx`'s failure handler previously discarded whatever error `api.ts` actually threw and always displayed the same hardcoded string (`i18n` key `mitigations.rejected`, "ACTION REJECTED: BUDGET TOO LOW") regardless of cause — meaning a cooldown rejection, a feature-freeze rejection, or a scenario-specific restriction (§ "Scenario interaction" below, if present) all rendered as a budget complaint. It now surfaces the backend's actual `detail` string (e.g. "Runbook on cooldown: 2 tick(s) remaining") and falls back to the generic string only when no message is available. The same fix was applied to `UpgradesPanel.tsx`, `EngineerRosterPanel.tsx`, and `IsometricOffice.tsx`'s build-mode placement handler, which had the identical swallow-and-hardcode pattern.

---

## 3. Mitigation Matrix — Cost, Debt, and Regulatory Risk Profile

| Action ID | Immediate Cash Impact | Immediate TDI Impact | Cascading-Risk Trajectory (via Document 02, Formula 2) | Regulatory Risk Profile |
|---|---|---|---|---|
| `rollback` | High cost (\$1,800 — the second-most expensive action) | Improves debt (−2) | Lowers future failure hazard for every downstream service depending on the healed node, compounding over subsequent ticks | **Low.** The only runbook that improves technical debt while resolving the incident; no compliance-adverse side effect. |
| `scale_replicas` | Highest cost (\$3,200) | Slightly worsens debt (+1) | Marginal long-run hazard increase, small enough that repeated use is economically self-limiting before it materially compounds | **Low-Moderate.** Expensive but debt-neutral in practice; the dominant risk is budget exhaustion (Document 02, § 3), not technical-debt-driven cascades. |
| `circuit_breaker` | Moderate cost (\$800) | Moderately worsens debt (+3) | Meaningful hazard increase if used repeatedly on the same or dependent services, per the $(1+TDI/35)^{1.8}$ exponent | **Moderate.** A defensible short-term stability trade for a real cost in long-run cascading exposure. |
| `emergency_patch` | Lowest cost (\$500 — the cheapest action) | Severely worsens debt (+8, the largest single delta in the catalog) | The fastest path to compounding cascade risk: two consecutive uses can move TDI by 16 points, and per Document 02 § 2.2's worked table, each +25 TDI band roughly multiplies base hazard by ~1.5–1.6× | **High.** This is the runbook whose own description ("Direct SSH hotfix... high technical debt") is a self-declared compliance smell. Its low cash cost makes it economically tempting precisely when an operator is under the MTTA/MTTA-fine pressure documented in Document 02 § 4.2, which is the exact "quick and dirty workaround under time pressure" failure mode that governance frameworks like SOX-404 and ISO 27001's change-management controls exist to catch. A sustained pattern of `emergency_patch` usage visible in the audit ledger (the Audit Ledger Data Dictionary, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`) is a legitimate audit finding warranting a compliance review, even though the platform itself does not automatically flag it beyond the generic `RUNBOOK_EXECUTED` / `compliance_flag=True` entry — the *pattern*, not the individual action, is what should trigger reviewer attention. |

---

## 4. Expected Operational ROI and Trade-Off Analysis

### `rollback` — Rollback Canary
**ROI profile:** Best sustained-play choice for any incident where a recent deployment is plausibly the root cause (the narrative pool documented in the Audit Ledger Data Dictionary includes several deployment-adjacent root causes). Its negative TDI delta means repeated legitimate use *improves* the platform's long-run cascading-failure resistance while resolving the immediate incident, making it the only runbook with a strictly positive long-run trade-off. The trade-off is purely upfront cash: at \$1,800 it is the second most expensive option, so an operator managing a thin budget runway under Document 02 § 3's burn pressure may be forced toward cheaper alternatives despite `rollback`'s superior long-run economics.

### `scale_replicas` — Spin Replicas (+4 Pods)
**ROI profile:** The most expensive single action in the catalog, appropriate when the operator's mental model of the incident is "capacity exhaustion" rather than "bad code." Its TDI cost is small (+1) and does not meaningfully accelerate future cascades on its own. The trade-off is almost entirely a cash-flow decision: at 5x the cost of `emergency_patch` for a comparable instantaneous resolution outcome (§ 2 confirms all runbooks resolve equally instantly), a governance-minded operator has no *mechanical* incentive to prefer this action's higher cost over `rollback`'s cheaper, debt-improving alternative — its narrative value (matching root causes like "traffic spikes") is the primary reason to select it over `rollback`.

### `circuit_breaker` — Enable Circuit Breaker
**ROI profile:** A balanced middle option — moderate cost, moderate debt cost — best suited to root causes involving cascading downstream failure (e.g., "Missing circuit breaker on edge gateway" is literally cited as a root-cause finding in the post-mortem template's 5-Whys section, Document 05). Its trade-off is that it neither improves debt like `rollback` nor is as cheap as `emergency_patch`; it is the "no strong opinion, stop the bleeding defensively" choice.

### `emergency_patch` — Hotfix Prod Live
**ROI profile:** The cheapest short-run fix by a wide margin (\$500, 44% cheaper than the next-cheapest option), which makes it the rational choice under acute budget scarcity or when an `UNATTENDED_ALERT_VIOLATION` fine (Document 02 § 4.2, \$4,500/tick) is actively accruing and every tick of delay is more expensive than the entire cost of this runbook. The trade-off is the steepest technical-debt cost in the catalog (+8), which — per Document 02's TDI sensitivity table — measurably raises the hazard of *every other service* in the topology on every subsequent tick until that debt is paid down (via `rollback` or the ambient 1-point-per-20-quiet-ticks relief described in Document 02 § 4.3). The correct governance reading of this runbook is that it is a legitimate emergency tool whose cost is deliberately deferred and externalized onto future incident probability rather than eliminated — exactly the "technical debt" metaphor the platform is built to teach.

### Cross-Cutting Observation
No runbook in the catalog differentiates its *outcome* by severity, service tier, or current incident age — the healing effect (`status → healthy`, `latency_ms` re-randomized to a fixed healthy band, `error_rate → 0.0001`) is byte-for-byte identical regardless of which of the four actions is invoked or which service it targets. The entire strategic surface of runbook selection is therefore the **cost / technical-debt trade-off matrix above**, not any difference in remediation efficacy — a deliberate design choice that keeps the mitigation decision legible for both gameplay and, by direct extension, for an auditor reviewing why a given action was chosen in a specific `RUNBOOK_EXECUTED` ledger entry.

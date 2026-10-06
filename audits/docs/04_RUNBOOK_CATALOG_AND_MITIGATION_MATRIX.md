# Runbook Catalog and Mitigation Matrix

**Document ID:** IZ-OPS-04  
**Classification:** Operational Reference / Compliance Package Exhibit D  
**Source of truth:** `backend/app/engine/formulas.py::MITIGATION_CATALOG`, `MITIGATION_EFFECTIVENESS`, and `SimulationEngine.apply_mitigation` in `backend/app/engine/simulator.py`  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Outubro 2026  
**Verification note (Outubro 2026):** the catalog, the refusal order, the effectiveness terms and the scenario overrides were re-read against `formulas.py`, `SimulationEngine.apply_mitigation` and `backend/app/engine/scenarios/*`. Runbook ids are `rollback`, `scale_replicas`, `circuit_breaker`, `emergency_patch` (the display name "Spin Replicas" belongs to `scale_replicas`).  

---

## 1. Full Catalog

| Action ID | Display Name | Category | Base Cost | TDI Delta | Resolve Speed Multiplier | Cooldown (ticks) | Description (as authored) |
|---|---|---|---|---|---|---|---|
| `rollback` | Rollback Canary | `deployment` | \$1,800.00 | −2 | 1.5× | 3 | Revert to last immutable stable container SHA. |
| `scale_replicas` | Spin Replicas (+4 Pods) | `infra` | \$3,200.00 | +1 | 1.2× | 4 | Horizontally scale compute pool to absorb traffic spikes. |
| `circuit_breaker` | Enable Circuit Breaker | `resilience` | \$800.00 | +3 | 1.1× | 5 | Shed non-critical traffic to protect database master. |
| `emergency_patch` | Hotfix Prod Live | `hotfix` | \$500.00 | +8 | 2.0× | 6 | Direct SSH hotfix. Instant cure, high technical debt. |

This is the canonical catalog served verbatim by `GET /api/mitigations/catalog`.

---

## 2. As-Implemented Mechanics — Enforced Behavior

| Field | Enforced by Backend Engine? | As-Implemented Effect |
|---|---|---|
| `cost` | **Yes.** | Evaluated against `self.budget < effective_cost`. Rejects with HTTP 400 (`"Insufficient budget runway"`). Base cost is reduced by: (1) `automated_cicd` upgrade (50% off for `rollback`), and (2) accurate root-cause triage (up to 50% discount scaled by `triage_accuracy`). |
| `tech_debt_delta` | **Yes.** | Base delta modified by `automated_cicd` (halved for `rollback`) and increased by `mismatch_tech_debt_tax` if runbook effectiveness is $< 0.70$. Clamped to `[0, 100]`. |
| `resolve_speed_multiplier` | **Yes.** | In standard/custom play, modulates runbook effectiveness via `formulas.mitigation_effectiveness()`: nudges base score by up to $\pm 15\%$ ($0.85 + 0.15 \times \text{resolve\_speed\_multiplier} / 2.0$). |
| `cooldown_ticks` | **Yes.** | Server-authoritative via `self.mitigation_last_fired_tick`. Rejects if $current\_tick - last\_fired < cooldown$. Cooldowns are persisted durably across restarts via session snapshots and broadcast via `mitigation_cooldowns` in telemetry. |
| *target service state* | **Yes.** | A runbook needs something to fix: it is rejected (HTTP 400, `"No open incident on this service"`) unless the service has an `active`/`acknowledged` incident, is already visibly sick (`status != healthy`, `latency_ms > 150` or `error_rate > 0.01`, which covers scenario-driven degradation that carries no incident row), or is an infected node in the ransomware scenario. Previously a runbook on a healthy service assumed an `acute_defect` cause, charged its cost and left the service degraded. The check runs after the cooldown check, and a rejection charges nothing and starts no cooldown. |
| `category` | **Yes.** | Category `"hotfix"` (`emergency_patch`) is subject to **Feature Freeze** restrictions when error budget is exhausted, except when targeted at an already-open incident on that service. |
| *refusal order* | **Yes.** | `POST /api/mitigations/execute` evaluates, in order: service exists, action exists, per-runbook cooldown, active-scenario veto (`mitigation_block_reason`), open-incident/visibly-sick rule, feature freeze, Black Friday latency lock, budget. Any refusal returns HTTP 400 with the engine's text, charges nothing and starts no cooldown. The cooldown is tracked per runbook id (not per service) and telemetry exposes the tick each runbook last fired in `mitigation_cooldowns`. |

---

## 3. Mitigation Effectiveness Matrix and Outcomes

### 3.1 Cause ↔ Action Compatibility

Effectiveness depends on the incident's underlying root cause category (`formulas.MITIGATION_EFFECTIVENESS`):

| Runbook (`action_id`) | Deploy Regression | Capacity Saturation | Dependency Fault | Acute Defect |
|---|---|---|---|---|
| `rollback` | **1.00** | 0.55 | 0.40 | 0.35 |
| `scale_replicas` | 0.40 | **1.00** | 0.45 | 0.35 |
| `circuit_breaker` | 0.35 | 0.55 | **1.00** | 0.40 |
| `emergency_patch` | 0.80 | 0.80 | 0.80 | **1.00** |

**Modifiers** (additive, applied after the matrix value has been scaled by $0.85 + 0.15 \times \text{resolve\_speed\_multiplier} / 2.0$; the sum is capped at 1.0):
- **Specialist Coverage:** Adds up to $+0.12 \times \text{specialist\_quality}$ (quality of the on-duty engineer assigned to the target service, Document 02 § 5.1).
- **Triage Accuracy:** A confirmed triage investigation adds up to $+0.15 \times \text{triage\_accuracy}$ (accuracy is $\max(0.15,\, 1 - 0.22 \times \text{wrong attempts})$).
- A service with no open incident that is nevertheless allowed (visibly sick or an infected node) is treated as an `acute_defect` cause.

### 3.2 Resolution Threshold and Partial Recovery

1. **Full Resolution ($\text{Effectiveness} \ge 0.70$):**
   - Service status transitions immediately to `healthy`.
   - Latency reset to healthy band (`[25, 60]` ms), error rate reset to `0.0001`.
   - Every active/acknowledged incident on that service transitions to `resolved` and is stamped with `tech_debt_at_resolution = self.tech_debt` (the incident is then removed from the live incident list; its row stays in the database for post-mortems).
   - Surcharge accumulation halts immediately.
2. **Partial Recovery / Degraded ($\text{Effectiveness} < 0.70$):**
   - Service status transitions to `degraded`.
   - Metrics partially interpolate toward baseline using `interpolate_partial_recovery()`.
   - Incident remains active/acknowledged and continues accruing MTTR and surcharge.
   - **Mismatch Tech Debt Tax:** An additional penalty is levied:
     $$
     \Delta TDI_{tax} = \text{round}\left((0.70 - \text{Effectiveness}) \times 6.0\right)
     $$

---

## 4. Operational Governance & Scenario-Specific Exceptions

### 4.1 Feature Freeze & Remediation Exception
When `feature_freeze_active` is engaged:
- Discretionary execution of `emergency_patch` is blocked to prevent unchecked technical debt accumulation.
- **Exception:** If the target service has an **already-open active incident**, `emergency_patch` is permitted. This prevents soft-locks for acute defects where only hotfixes clear the 0.70 resolution threshold.

### 4.2 Scripted Challenge Scenarios
Scripted scenarios balance challenge mechanics via specific overrides:
- **Baseline Effectiveness:** While any registered scripted scenario is active (`black_friday_rush`, `chaos_engineering_drill`, `ddos_global`, `deployment_rollback`, `ransomware_infiltration`, `third_party_outage`), effectiveness is normalized to 1.0 (every permitted runbook fully resolves) so challenge balance relies on bespoke mission constraints. The effectiveness matrix of § 3 applies in the sandbox and in the data-driven `custom` scenario. The triage cost discount still applies in every mode.
- **Black Friday Restriction:** If the **target service's** latency exceeds 500 ms during Black Friday Rush, `rollback` and `emergency_patch` are rejected; `scale_replicas` and `circuit_breaker` remain permitted to absorb capacity saturation.
- **Ransomware Quarantine:** Executing `circuit_breaker` on an infected service registers it in `quarantined_service_ids`, containing outbound lateral movement. This works on an infected service that has no incident row (it may still look healthy).
- **Third-Party Outage:** `ScenarioEngine.mitigation_block_reason()` lets a scenario veto a runbook. While the provider is down, any runbook on `srv-payment` or `srv-notify` is rejected (`"External provider outage: no internal fix is available..."`) so a cheap circuit breaker cannot "fix" a vendor outage; downstream services (`srv-auth`, `srv-api-gw`) remain treatable.

### 4.3 Atomic Persistence and Incident Attribution
Runbook execution executes within an atomic database transaction under `self._db_write_lock`:
- Resolves the incident row with `resolved_tick` and `tech_debt_at_resolution`.
- Debits cash and records the `RUNBOOK_EXECUTED` event in `AuditLog` explicitly tagged with `incident_id`.
- Reconstructs financial ledger entries reliably from audit history upon session resume.


# Runbook Catalog and Mitigation Matrix

**Document ID:** IZ-OPS-04  
**Classification:** Operational Reference / Compliance Package Exhibit D  
**Source of truth:** `backend/app/engine/formulas.py::MITIGATION_CATALOG`, `MITIGATION_EFFECTIVENESS`, and `SimulationEngine.apply_mitigation` in `backend/app/engine/simulator.py`  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Setembro 2026  

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
| `category` | **Yes.** | Category `"hotfix"` (`emergency_patch`) is subject to **Feature Freeze** restrictions when error budget is exhausted, except when targeted at an already-open incident on that service. |

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

**Modifiers:**
- **Specialist Coverage:** Adds up to $+0.12 \times \text{specialist\_quality}$.
- **Triage Accuracy:** Confirmed triage investigation adds up to $+0.15 \times \text{triage\_accuracy}$.

### 3.2 Resolution Threshold and Partial Recovery

1. **Full Resolution ($\text{Effectiveness} \ge 0.70$):**
   - Service status transitions immediately to `healthy`.
   - Latency reset to healthy band (`[25, 60]` ms), error rate reset to `0.0001`.
   - Matching active/acknowledged incidents transition to `resolved` and are stamped with `tech_debt_at_resolution = self.tech_debt`.
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
- **Baseline Effectiveness:** In standard scripted scenarios (`black_friday_rush`, `ransomware_infiltration`, `chaos_week`), baseline effectiveness is normalized to 1.0 so challenge balance relies on bespoke mission constraints.
- **Black Friday Restriction:** If latency exceeds 500 ms during Black Friday, `rollback` and `emergency_patch` are rejected; only `scale_replicas` is permitted to absorb capacity saturation.
- **Ransomware Quarantine:** Executing `circuit_breaker` on an infected service registers it in `quarantined_service_ids`, containing outbound lateral movement.

### 4.3 Atomic Persistence and Incident Attribution
Runbook execution executes within an atomic database transaction under `self._db_write_lock`:
- Resolves the incident row with `resolved_tick` and `tech_debt_at_resolution`.
- Debits cash and records the `RUNBOOK_EXECUTED` event in `AuditLog` explicitly tagged with `incident_id`.
- Reconstructs financial ledger entries reliably from audit history upon session resume.


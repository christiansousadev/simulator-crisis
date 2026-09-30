# Mathematical Engine and SLA Specification

**Document ID:** IZ-MATH-02  
**Classification:** Internal Architectural Reference / Compliance Package Exhibit B  
**Source of truth:** `backend/app/engine/formulas.py` (pure functions, no I/O), consumed by `backend/app/engine/simulator.py`  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Setembro 2026  

---

## 0. Notation and Constant Reference

All formulas below are implemented exactly as written in `formulas.py` and `simulator.py`; every constant cited is the literal value declared in the codebase. Ticks are the atomic unit of simulated time (`1 tick = 1 simulated hour`); all timing-based constants are expressed in whole ticks.

| Symbol | Constant Name | Value | Purpose |
|---|---|---|---|
| $W_{critical}$ | `CRITICAL_WEIGHT` | 3.0 | SLA weight for critical-tier services |
| $W_{standard}$ | `STANDARD_WEIGHT` | 1.0 | SLA weight for standard-tier services |
| $P_{base}$ | `BASE_FAILURE_PROBABILITY` | 0.015 | Base per-tick stochastic failure hazard |
| $P_{max}$ | `MAX_FAILURE_PROBABILITY` | 0.65 | Hard clamp on final failure probability |
| $D$ | `TDI_HAZARD_DIVISOR` | 35.0 | Tech Debt Index sensitivity scale |
| $E$ | `TDI_HAZARD_EXPONENT` | 1.8 | Tech Debt non-linear hazard exponent |
| $S_{down}$ | `DOWN_DEPENDENCY_SHOCK` | 3.5 | Upstream `down` dependency risk multiplier increment |
| $S_{degraded}$ | `DEGRADED_DEPENDENCY_SHOCK` | 1.8 | Upstream `degraded` dependency risk multiplier increment |
| $T_{fatigue\_start}$ | `ALERT_FATIGUE_START_TICK` | 5 | Tick at which alert fatigue starts draining happiness |
| $T_{fatigue\_end}$ | `ALERT_FATIGUE_END_TICK` | 11 | Tick at which alert fatigue drain window ends |
| $\Delta H_{fatigue}$ | `ALERT_FATIGUE_HAPPINESS_PENALTY` | 1.5 | Per-tick happiness drain during alert fatigue window |
| $T_{breach}$ | `UNATTENDED_BREACH_TICK` | 12 | Tick at which unattended alert triggers regulatory fine |
| $F_{breach}$ | `UNATTENDED_BREACH_FINE` | \$4,500.00 | Per-tick fine for unacknowledged incidents beyond tick 12 |
| $g$ | `SURCHARGE_GROWTH_RATE` | 0.08 | Incident surcharge growth coefficient |
| $\gamma$ | `SURCHARGE_EXPONENT` | 1.3 | Incident surcharge non-linear exponent |
| $B_{cloud}$ | `PASSIVE_CLOUD_BURN` | \$200.00 / tick | Baseline cloud infrastructure operational burn |
| $B_{payroll}$ | `PASSIVE_PAYROLL_BURN` | \$450.00 / tick | Baseline engineering payroll operational burn |
| $B_{base}$ | `PASSIVE_BASE_BURN` | \$650.00 / tick | Total passive operational burn ($B_{cloud} + B_{payroll}$) |
| $M_{churn}$ | `CHURN_BURN_MULTIPLIER` | 1.5 | Burn acceleration factor under customer churn |
| $H_{churn}$ | `CHURN_HAPPINESS_THRESHOLD` | 40.0% | Customer happiness threshold triggering churn burn |
| $SLA_{benchmark}$ | `SLA_BENCHMARK` | 99.90% | SRE target governing Error Budget and Feature Freeze |
| $SLA_{breach}$ | `SLA_BREACH_THRESHOLD` | 99.00% | External compliance breach sanction threshold |
| $EB_{total}$ | `TOTAL_ERROR_BUDGET_PCT` | 0.10% | Total allowable unavailability ($100.0 - 99.90$) |
| $W_{sla}$ | `VICTORY_TICK_THRESHOLD` | 720 | Rolling SLA window capacity (samples) and monthly cycle |
| $T_{grace}$ | `BREACH_GRACE_TICKS` | 24 | Grace period ticks before breach evaluation starts |
| $W_{eb}$ | `ERROR_BUDGET_BURN_RATE_WINDOW` | 10 | Sample window size for error budget burn rate |
| $\Theta_{mitigation}$ | `MITIGATION_FULL_RESOLUTION_THRESHOLD` | 0.70 | Effectiveness threshold required for full resolution |
| $\Psi_{tax}$ | `MISMATCH_TECH_DEBT_TAX_SCALE` | 6.0 | Maximum TDI penalty scalar for mismatched runbooks |

Severity base surcharge table (`SEVERITY_BASE_SURCHARGE`):

| Severity | Base (\$/tick) |
|---|---|
| `P1_CRITICAL` | 800.00 |
| `P2_HIGH` | 250.00 |
| `P3_MEDIUM` | 100.00 |
| `P4_LOW` | 40.00 |

---

## 1. Formula 1 — Availability, Rolling SLA, and Error Budget

### 1.1 Per-Service Unavailability Factor $U_i(t)$

Implemented in `formulas.unavailability_factor(status, latency_ms, error_rate)`:

$$
U_i(t) = \begin{cases}
0 & \text{status} = \text{healthy} \\[4pt]
\min\!\left(1.0,\; 0.5 \cdot \max\!\left(0.0, \dfrac{latency\_ms - 100}{1000}\right) \;+\; 0.5 \cdot error\_rate\right) & \text{status} = \text{degraded} \\[8pt]
1.0 & \text{status} = \text{down}
\end{cases}
$$

The `degraded` branch balances latency and error rate. The latency term activates above a 100 ms baseline floor and scales linearly to saturate its 0.5 ceiling at 1100 ms. The error term contributes up to 0.5 for an `error_rate` of 1.0 (100% failure). The outer clamp ensures $U_i(t) \in [0.0, 1.0]$.

### 1.2 Instantaneous Tick SLA $SLA_{tick}(t)$

Implemented in `formulas.instant_sla_percentage(services)`:

$$
SLA_{tick}(t) = 100 \times \left(1 - \frac{\sum_{i=1}^{N} w_i \cdot U_i(t)}{\sum_{i=1}^{N} w_i}\right), \qquad w_i = \begin{cases} 3.0 & tier_i = \text{critical} \\ 1.0 & tier_i = \text{standard} \end{cases}
$$

Across the canonical five-service topology (3 critical: `srv-auth`, `srv-payment`, `srv-api-gw`; 2 standard: `srv-search`, `srv-notify`), the total weight is $\sum w_i = 3(3.0) + 2(1.0) = 11.0$.
- Single critical service `down`: $SLA_{tick} = 100 \times (1 - 3/11) = 72.73\%$.
- Single standard service `down`: $SLA_{tick} = 100 \times (1 - 1/11) = 90.91\%$.
- All services healthy: $SLA_{tick} = 100.00\%$.

### 1.3 Rolling 720-Sample Window SLA Integration

Implemented in `simulator.py` via `self._sla_window`:

$$
SLA_{rolling}(t) = \text{clamp\_percentage}\left(\frac{1}{|W_t|} \sum_{s \in W_t} SLA_{tick}(s)\right)
$$

Where $W_t$ is a bounded deque (`collections.deque(maxlen=720)`).

**Persistence and Restart Continuity:**
- The engine SLA (`sla_percentage`) is **not** an all-time arithmetic mean accumulated from tick 0.
- The sample window is serialized to JSON (`sla_window_json`) and persisted in `GameSession`.
- Upon crash or restart, `_deserialize_sla_window` rehydrates the full deque of up to 720 individual historical samples. The post-restart simulation resumes the exact sequence of sample retirement without statistical drift or false reset.

### 1.4 Semantic Differentiation: Sample, Window SLA, Error Budget, Freeze, and Breach

The platform strictly separates availability measurement, operational change management, and regulatory compliance into distinct layers:

1. **Tick Availability Sample ($SLA_{tick}$):**
   - Instantaneous weighted availability of the 5 services at tick $t$, computed by `formulas.instant_sla_percentage(self.services)`.
2. **Rolling Window SLA ($SLA_{rolling}$):**
   - Arithmetic mean over the active samples in `self._sla_window` (up to 720 ticks / 1 audit month). Bounded to the sliding window; no memory of ticks older than 720 ticks.
3. **Error Budget Burn & Remaining Ratio (Operational SRE):**
   - Derived from $SLA_{rolling}(t)$ against the benchmark target of `99.90%`:
     $$
     \text{BurnRatio}(t) = \frac{100.0 - SLA_{rolling}(t)}{\text{TOTAL\_ERROR\_BUDGET\_PCT}} = \frac{100.0 - SLA_{rolling}(t)}{0.10}
     $$
     $$
     \text{RemainingRatio}(t) = \text{clamp\_ratio}(1.0 - \text{BurnRatio}(t)) \in [0.0, 1.0]
     $$
4. **Feature Freeze (Operational Change Freeze):**
   - When $\text{RemainingRatio}(t) \le 0.0$ (i.e. rolling SLA $< 99.90\%$), the engine activates `feature_freeze_active = True`, logging `FEATURE_FREEZE_ENGAGED`.
   - **Operational Rule:** Feature freeze blocks discretionary, high-risk runbooks (`emergency_patch`).
   - **Remediation Exception:** To prevent soft-locks, `emergency_patch` remains permitted if targeted at a service that has an **already-open active incident** (`active_incident_service_ids`).
   - When rolling SLA recovers such that $\text{RemainingRatio}(t) > 0.0$, `FEATURE_FREEZE_LIFTED` is emitted.
5. **Regulatory Breach (Compliance Sanction):**
   - Evaluated strictly against the rolling window SLA $SLA_{rolling}(t)$ only after the initial grace period (`current_tick > 24`, defined by `BREACH_GRACE_TICKS = 24`).
   - If $SLA_{rolling}(t) < 99.00\%$ (`SLA_BREACH_THRESHOLD`), status flips to `breached`, logging `SLA_BREACH_EMERGENCY_SANCTION` with a \$15,000 regulatory sanction.
   - If rolling SLA recovers to $\ge 99.00\%$, status reverts to `running`.
   - **Critical Semantic Distinction:** Regulatory breach never depends on an all-time cumulative availability from tick 0; it reflects exclusively the 720-sample rolling window once the 24-tick grace period has elapsed.

---

## 2. Formula 2 — Cascading Failure and Stochastic Hazard Model

### 2.1 Dependency Shock Multiplier and Queue Decoupling

Implemented in `formulas.dependency_shock_multiplier(dependency_statuses)`:

$$
M_{dep} = \prod_{d \in \text{Deps}(i)} \begin{cases} 1 + S_{down} = 4.5 & status(d) = \text{down} \\ 1 + S_{degraded} = 2.8 & status(d) = \text{degraded} \\ 1.0 & status(d) = \text{healthy} \end{cases}
$$

If an upstream service is decoupled via an infrastructure node (`kafka_queue`), its status is removed prior to hazard calculation using `formulas.apply_queue_decoupling(dep_statuses_by_id, decoupled_ids)`.

### 2.2 Base Cascading Failure Probability

Implemented in `formulas.cascading_failure_probability(tech_debt, dependency_statuses)`:

$$
P_{raw}(i) = P_{base} \cdot \left(1 + \frac{TDI}{D}\right)^{E} \cdot M_{dep} = 0.015 \cdot \left(1 + \frac{TDI}{35}\right)^{1.8} \cdot M_{dep}
$$

*Critical Architectural Invariant:* $P_{raw}(i)$ is **deliberately not clamped** inside `cascading_failure_probability`. It represents the raw hazard before call-site multipliers are applied.

### 2.3 Comprehensive Hazard Multiplier Chain

Inside `SimulationEngine._evaluate_random_failures()`, the effective failure hazard $P_{failure}(i)$ compounds through the following exact sequence:

1. **Raw Hazard:** $P_1 = P_{raw}(i)$
2. **Dependent Blast Radius Exposure:**
   $$
   P_2 = P_1 \times (1.0 + 0.05 \times \text{dependents\_count}(i))
   $$
   Services that many other services depend on (high fan-in) feel higher hazard from the same global tech debt.
3. **Specialist Coverage Discount:**
   $$
   P_3 = P_2 \times (1.0 - 0.35 \times \text{specialist\_quality}(i))
   $$
4. **Temporary Decision Hazard Multiplier:**
   $$
   P_4 = P_3 \times M_{temp\_decision}
   $$
5. **Multi-AZ Clusters Upgrade:**
   If `multi_az_clusters` is purchased: $P_5 = P_4 \times 0.60$ (otherwise $P_4$).
6. **Infrastructure Nodes:**
   - If `db_read_replica` is placed for service: $P_6 = P_5 \times 0.75$.
   - If `nginx_lb` is placed for service: $P_6 = P_5 \times 0.85$.
7. **Scenario Hazard Multiplier:**
   $P_7 = P_6 \times M_{scenario}$ (e.g., $1.0$ baseline, $1.4$ in chaos scenarios).
8. **Difficulty Multiplier:**
   $P_8 = P_7 \times M_{diff}$ (`intern`: $0.7$, `standard`: $1.0$, `chaos`: $1.4$).
9. **Governance Reputation Multiplier:**
   $$
   P_9 = P_8 \times \begin{cases} 1.15 & \text{reputation} < 25.0 \text{ (Crisis)} \\ 0.90 & \text{reputation} > 75.0 \text{ (Trusted)} \\ 1.00 & 25.0 \le \text{reputation} \le 75.0 \end{cases}
   $$
10. **Final Probability Clamp:**
    $$
    P_{failure}(i) = \text{clamp\_probability}(P_9) = \text{clamp}(P_9,\; 0.0,\; 0.65)
    $$
    The clamp to `MAX_FAILURE_PROBABILITY` ($0.65$) occurs **strictly after all multipliers are applied**. Any non-finite input is safely pinned to $0.0$.

---

## 3. Formula 3 — Runbook Mitigation Matrix and Effectiveness

### 3.1 Cause Categories and Compatibility Matrix

Every incident is tagged with a root cause assigned to one of four categories (`event_generator.cause_category_for_root_cause`):
1. `deploy_regression`
2. `capacity_saturation`
3. `dependency_fault`
4. `acute_defect`

The compatibility matrix (`formulas.MITIGATION_EFFECTIVENESS`) defines the baseline effectiveness:

| Runbook (`action_id`) | Deploy Regression | Capacity Saturation | Dependency Fault | Acute Defect |
|---|---|---|---|---|
| `rollback` | **1.00** | 0.55 | 0.40 | 0.35 |
| `scale_replicas` | 0.40 | **1.00** | 0.45 | 0.35 |
| `circuit_breaker` | 0.35 | 0.55 | **1.00** | 0.40 |
| `emergency_patch` | 0.80 | 0.80 | 0.80 | **1.00** |

### 3.2 Effective Runbook Score and Resolution Threshold

Implemented in `formulas.mitigation_effectiveness(action_id, cause_category, resolve_speed_multiplier)`:

$$
\text{Effectiveness} = \min\!\left(1.0,\; \text{Base} \times \left(0.85 + 0.15 \cdot \frac{\text{resolve\_speed\_multiplier}}{2.0}\right)\right)
$$

- **Full Resolution ($\text{Effectiveness} \ge 0.70$):**
  The service transitions to `healthy` ($latency\_ms = 25$, $error\_rate = 0.0$), the incident transitions to `resolved`, and active surcharge bleed stops.
- **Partial Recovery / Degraded ($\text{Effectiveness} < 0.70$):**
  The service transitions to `degraded`. Metrics recover partially proportional to effectiveness:
  $$
  v_{new} = \text{interpolate\_partial\_recovery}(v_{current},\; v_{healthy},\; \text{Effectiveness}) = v_{current} - (v_{current} - v_{target}) \times \text{Effectiveness}
  $$
  The incident remains open until a compatible runbook is executed.
- **Mismatch Tech Debt Tax:**
  Applying a poorly fitted runbook adds a technical debt penalty:
  $$
  \Delta TDI_{tax} = \text{round}\left(\max(0.0,\; 0.70 - \text{Effectiveness}) \times 6.0\right)
  $$

---

## 4. Formula 4 — Financial Engine and Ledger Economics

### 4.1 Passive Operational Burn and Churn

Implemented in `formulas.effective_passive_burn(user_happiness)`:

$$
B_{eff}(t) = \begin{cases} B_{base} \times M_{churn} = \$650.00 \times 1.5 = \$975.00/\text{tick} & user\_happiness < 40.0\% \\ B_{base} = \$650.00/\text{tick} & user\_happiness \ge 40.0\% \end{cases}
$$

### 4.2 Incident Surcharge Growth

Implemented in `formulas.incident_surcharge(severity, elapsed_ticks)`:

$$
Surcharge(severity, t) = SeverityBase(severity) \times (1 + 0.08 \cdot t)^{1.3}
$$

The surcharge accumulates per active or acknowledged incident for every tick until resolved.

### 4.3 Central Financial Mutation and Audit Adjustments

All financial mutations pass through `simulator._apply_financial_event(category, amount, details)`.

**Persistence Topology of Financial State:**
- **Current Session Balance:** Stored durably as a single scalar in `GameSession.budget`.
- **Per-Incident Aggregate Surcharge:** Stored durably in `Incident.accrued_surcharge` for each incident record, providing an immutable historical figure for post-mortems and dossiers.
- **Discrete Durable Financial Events:** Stored permanently as append-only rows in `AuditLog` (`RUNBOOK_EXECUTED`, `UNATTENDED_ALERT_VIOLATION`, `AI_AUDITOR_VERDICT_APPLIED`, `DILEMMA_RESOLVED`, `ENGINEER_HIRED`, `UPGRADE_PURCHASED`, `INFRASTRUCTURE_NODE_PLACED`).
- **Runtime Ledger Cache (`financial_ledger`):** A bounded (500 entries) in-memory list rehydrated on session restore by `_reconstruct_financial_ledger()` from historical `AuditLog` entries via `_LEDGER_RECONSTRUCTION_MAP`.
- **Documented Limitation on Routine Granularity:** Routine per-tick operational cloud burn (`operational_expense`) and per-tick open incident surcharges (`incident_surcharge`) are debited directly from `budget` without emitting individual `AuditLog` rows (avoiding database flooding on every tick). Consequently, their individual tick-by-tick line items are not reconstructed in the in-memory `financial_ledger` after a process restart, whereas the resulting cash balance (`GameSession.budget`) and per-incident totals (`Incident.accrued_surcharge`) remain completely durable.

**AI Auditor Adjustments (`formulas.eligible_audit_adjustment`):**
- Outputs from LLM interviews are treated as untrusted text.
- If verdict is `NON_COMPLIANT`:
  $$
  Fine = \text{clamp}(proposed,\; 0.0,\; Ceiling(severity))
  $$
  where $Ceiling \in \{\text{P1}: \$6000, \text{P2}: \$3000, \text{P3}: \$1500, \text{P4}: \$750\}$.
- If verdict is `VALID` or `JUSTIFIED`:
  $$
  Credit = \text{clamp}(proposed,\; -\$2000.0,\; 0.0)
  $$
- Non-finite or malformed values fail-safe to \$0.00 adjustment.

---

## 5. Formula 5 — Staff Fatigue, Stamina, and Investigation Mechanics

### 5.1 Specialist Quality Score

Implemented in `formulas.specialist_quality(engineer, competency_map, service_id)`:

$$
Quality = \begin{cases}
0.0 & \text{not assigned or not on duty} \\
\text{round}\left(Base \times \max\!\left(0.30,\; 1.0 - \dfrac{stress}{100.0} \times 0.70\right),\; 3\right) & \text{on duty}
\end{cases}
$$

Where $Base = 1.0$ if $competency == service\_specialty$, else $0.45$.

### 5.2 Specialist Operational Multipliers

1. **Recovery Burn Rate Multiplier:**
   $$
   M_{burn} = \begin{cases} 1.0 & Quality \le 0.0 \\ \max(0.65,\; 1.3 - 0.65 \times Quality) & Quality > 0.0 \end{cases}
   $$
2. **Hazard Discount:**
   $$
   Discount_{hazard} = 1.0 - 0.35 \times Quality
   $$
3. **Stress Gain per Unacknowledged Tick:**
   $$
   \Delta Stress = 1.5 \times SeverityWeight \times \left(1 + \frac{stress}{100.0}\right)^{1.15} \times \begin{cases} 0.7 & \text{competency matched} \\ 1.3 & \text{mismatched} \end{cases}
   $$

### 5.3 Investigation and Log Triage Math

Implemented in `formulas.triage_accuracy(wrong_attempts)`:

$$
\text{Accuracy} = \max\!\left(0.15,\; 1.0 - 0.22 \times wrong\_attempts\right)
$$

- Each wrong triage attempt inflicts $+3.0$ stress (`TRIAGE_WRONG_ATTEMPT_STRESS`) on the assigned engineer.
- A confirmed root cause grants:
  - Runbook cost discount: $\text{Accuracy} \times 50\%$.
  - Runbook effectiveness bonus: $\text{Accuracy} \times 15\%$.
- **Invariant:** MTTA and MTTR values are strictly elapsed historical tick counts and **never** decrease retroactively upon triage completion.

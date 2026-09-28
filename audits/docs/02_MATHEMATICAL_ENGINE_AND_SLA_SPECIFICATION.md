# Mathematical Engine and SLA Specification

**Document ID:** IZ-MATH-02
**Classification:** Internal Architectural Reference / Compliance Package Exhibit B
**Source of truth:** `backend/app/engine/formulas.py` (pure functions, no I/O), consumed by `backend/app/engine/simulator.py`

> **Staleness notice:** `formulas.py` itself is still the correct source of truth for the core
> SLA/hazard math below, but `simulator.py` now layers additional multipliers on top of
> `cascading_failure_probability` at the call site — difficulty preset, governance-reputation
> threshold, build-mode infrastructure nodes, and active-scenario hazard multipliers — none of
> which are documented here. See `audits/docs/implementations/02_ERROR_BUDGET_AND_CAB_GOVERNANCE_SPEC.md`,
> `.../03_STAFF_ONCALL_AND_FATIGUE_SPEC.md` and the `commercial/01_DYNAMIC_TOPOLOGY_BUILDER_SPEC.md`
> for those additions, and `backend/app/engine/simulator.py::_evaluate_random_failures` for the
> exact composition order.

---

## 0. Notation and Constant Reference

All formulas below are implemented exactly as written in `formulas.py`; every constant cited is the literal value declared in that module. Ticks are the atomic unit of simulated time (`1 tick = 1 simulated hour` per the platform's tick-scale convention); all timing-based constants (`ALERT_FATIGUE_START_TICK`, `UNATTENDED_BREACH_TICK`, cooldowns, etc.) are expressed in whole ticks.

| Symbol | Constant Name | Value |
|---|---|---|
| $W_{critical}$ | `CRITICAL_WEIGHT` | 3.0 |
| $W_{standard}$ | `STANDARD_WEIGHT` | 1.0 |
| $P_{base}$ | `BASE_FAILURE_PROBABILITY` | 0.015 |
| $P_{max}$ | `MAX_FAILURE_PROBABILITY` | 0.65 |
| $D$ | `TDI_HAZARD_DIVISOR` | 35.0 |
| $E$ | `TDI_HAZARD_EXPONENT` | 1.8 |
| $S_{down}$ | `DOWN_DEPENDENCY_SHOCK` | 3.5 |
| $S_{degraded}$ | `DEGRADED_DEPENDENCY_SHOCK` | 1.8 |
| $T_{fatigue\_start}$ | `ALERT_FATIGUE_START_TICK` | 5 |
| $T_{fatigue\_end}$ | `ALERT_FATIGUE_END_TICK` | 11 |
| $\Delta H_{fatigue}$ | `ALERT_FATIGUE_HAPPINESS_PENALTY` | 1.5 (happiness points) |
| $T_{breach}$ | `UNATTENDED_BREACH_TICK` | 12 |
| $F_{breach}$ | `UNATTENDED_BREACH_FINE` | \$4,500.00 |
| $g$ | `SURCHARGE_GROWTH_RATE` | 0.08 |
| $\gamma$ | `SURCHARGE_EXPONENT` | 1.3 |
| $B_{cloud}$ | `PASSIVE_CLOUD_BURN` | \$200.00 / tick |
| $B_{payroll}$ | `PASSIVE_PAYROLL_BURN` | \$450.00 / tick |
| $B_{base}$ | `PASSIVE_BASE_BURN` | \$650.00 / tick ($B_{cloud}+B_{payroll}$) |
| $M_{churn}$ | `CHURN_BURN_MULTIPLIER` | 1.5 |
| $H_{churn}$ | `CHURN_HAPPINESS_THRESHOLD` | 40.0% |
| — | `SLA_BENCHMARK` | 99.90% ("three nines", informational target, not itself a trigger) |
| $SLA_{breach}$ | `SLA_BREACH_THRESHOLD` | 99.00% |

Severity base surcharge table (`SEVERITY_BASE_SURCHARGE`):

| Severity | Base ($/tick) |
|---|---|
| `P1_CRITICAL` | 800.00 |
| `P2_HIGH` | 250.00 |
| `P3_MEDIUM` | 100.00 |
| `P4_LOW` | 40.00 |

`P3_MEDIUM` and `P4_LOW` are defined in the severity/surcharge tables for schema completeness and forward compatibility, but the current incident-generation path (`event_generator.severity_for_tier`) only ever emits `P1_CRITICAL` (for `tier == "critical"` services) or `P2_HIGH` (for `tier == "standard"` services); the two lower severities are reachable only if a future change to the generator introduces them, and `incident_surcharge`'s `SEVERITY_BASE_SURCHARGE.get(severity, SEVERITY_BASE_SURCHARGE["P4_LOW"])` lookup already defends against an unrecognized severity string by falling back to the lowest base rate.

---

## 1. Formula 1 — Global SLA Calculation

### 1.1 Per-Service Unavailability Factor $U_i(t)$

Implemented in `unavailability_factor(status, latency_ms, error_rate)`:

$$
U_i(t) = \begin{cases}
0 & \text{status} = \text{healthy} \\[4pt]
\min\!\left(1,\; 0.5 \cdot \max\!\left(0, \dfrac{latency\_ms - 100}{1000}\right) \;+\; 0.5 \cdot error\_rate\right) & \text{status} = \text{degraded} \\[8pt]
1 & \text{status} = \text{down}
\end{cases}
$$

The `degraded` branch blends two normalized signals, each capped in contribution at 0.5: a latency penalty that only accrues above a 100 ms floor (below that, the max/0 clamp zeroes it) and scales such that 1100 ms of latency alone would already saturate the latency term at its 0.5 ceiling, and a raw error-rate contribution (an `error_rate` of 1.0, i.e. 100% failing requests, saturates the error term at its own 0.5 ceiling). The outer `min(1, ...)` guarantees $U_i(t)$ never exceeds full unavailability even if both terms are independently maxed.

### 1.2 Instantaneous Tick SLA

Implemented in `instant_sla_percentage(services)`:

$$
SLA_{tick}(t) = 100 \times \left(1 - \frac{\sum_{i=1}^{N} w_i \cdot U_i(t)}{\sum_{i=1}^{N} w_i}\right), \qquad w_i = \begin{cases} 3.0 & tier_i = \text{critical} \\ 1.0 & tier_i = \text{standard} \end{cases}
$$

With the platform's fixed five-service topology (three `critical` services — `srv-auth`, `srv-payment`, `srv-api-gw` — and two `standard` services — `srv-search`, `srv-notify`), the weight denominator is a constant: $\sum w_i = 3(3.0) + 2(1.0) = 11.0$. Consequently, a single critical service going fully `down` in isolation ($U_i = 1$, all others healthy) yields:

$$
SLA_{tick} = 100 \times \left(1 - \frac{3.0}{11.0}\right) = 72.73\%
$$

while a single standard service going fully down in isolation yields $100 \times (1 - 1/11) = 90.91\%$ — a direct, auditable expression of why critical-tier services are weighted 3x for SLA purposes. If `total_weight` were ever zero (no services present), the function returns `100.0` by explicit guard rather than dividing by zero.

### 1.3 Cumulative SLA Integration

Implemented across `simulator._update_simulation_tick`:

$$
\text{cumulative\_sla\_points}(T) \mathrel{+}= SLA_{tick}(T), \qquad SLA_{cumulative}(T) = \frac{\text{cumulative\_sla\_points}(T)}{T + 1}
$$

`cumulative_sla_points` is seeded at `100.0` at engine construction (representing tick 0's implicit perfect health before the loop has run) and accumulates the *raw, unrounded* `instant_sla_percentage` return value every tick thereafter; the running mean is recomputed every tick as the accumulated points divided by `current_tick + 1` (the `+1` accounts for the tick-0 seed value sharing the denominator). This is a simple arithmetic mean over all elapsed ticks, not a windowed or decaying average — a single catastrophic multi-hour outage early in a long-running session leaves a permanent, only-slowly-diluted scar on `sla_percentage`, which is the quantity displayed on the Topbar's SLA Shield gauge and is the sole input to the breach/victory status checks in § 1.4.

### 1.4 SLA-Driven Session Status Transitions

`_evaluate_session_status()` checks, in this exact order, every tick:

1. **Bankruptcy** (`budget <= 0.0`) takes precedence over every other condition and halts the tick loop (`is_running = False`); this is evaluated before the SLA checks below.
2. **Victory**: `current_tick >= 720` (the platform's "one monthly SLA audit cycle" constant, `VICTORY_TICK_THRESHOLD`) **and** `sla_percentage >= SLA_BREACH_THRESHOLD (99.00%)`. Reaching tick 720 with cumulative SLA below 99.00% does *not* trigger victory; the loop simply continues (subject to the breach logic below) until either budget is exhausted or SLA recovers above the threshold on some later tick.
3. **Breach**: only evaluated once `current_tick > BREACH_GRACE_TICKS (24)` — a 24-tick statistical grace period during which a single early outage cannot flip session status — and only while status is not already `bankrupted`/`victory`. If `sla_percentage < 99.00%` the status becomes `breached` and an `SLA_BREACH_EMERGENCY_SANCTION` audit event is logged with `compliance_flag=False`. `breached` is not a terminal state: if cumulative SLA subsequently recovers to `>= 99.00%`, the status reverts to `running` on the same tick that condition is met, with no audit event logged for the recovery.

---

## 2. Formula 2 — Cascading Failure Model

### 2.1 Dependency Shock Multiplier

Implemented in `dependency_shock_multiplier(dependency_statuses)`:

$$
M_{dep} = \prod_{d \in \text{Deps}(i)} \begin{cases} 1 + S_{down} = 4.5 & status(d) = \text{down} \\ 1 + S_{degraded} = 2.8 & status(d) = \text{degraded} \\ 1 & status(d) = \text{healthy} \end{cases}
$$

This is a strict multiplicative product across every direct upstream dependency (the platform's dependency graph is one level deep in practice: `srv-payment` depends on `srv-auth`; `srv-api-gw` depends on both `srv-auth` and `srv-payment`; `srv-search` and `srv-notify` each depend on `srv-api-gw`). If `srv-api-gw`'s two dependencies (`srv-auth`, `srv-payment`) were simultaneously `down`, its shock multiplier would compound to $4.5 \times 4.5 = 20.25$ before the outer cap described in § 2.2 is applied.

### 2.2 Effective Failure Hazard

Implemented in `cascading_failure_probability(tech_debt, dependency_statuses)`:

$$
P_{failure}(i) = \min\!\left(P_{max},\; P_{base} \cdot \left(1 + \frac{TDI}{D}\right)^{E} \cdot M_{dep}\right) = \min\!\left(0.65,\; 0.015 \cdot \left(1 + \frac{TDI}{35}\right)^{1.8} \cdot M_{dep}\right)
$$

This is evaluated **once per healthy service, per tick**, inside `_evaluate_random_failures()`, and is skipped entirely (for every service) once four or more incidents are simultaneously active (`MAX_CONCURRENT_INCIDENTS = 4`, a playability throttle, not a mathematical term). A uniform random draw `random.random() < P_failure(i)` decides whether that service transitions out of `healthy` on that tick.

**Worked TDI sensitivity table** (dependency multiplier held at 1.0, i.e. no unhealthy upstream):

| TDI | Debt multiplier $(1+TDI/35)^{1.8}$ | $P_{failure}$ |
|---|---|---|
| 0 | 1.000 | 1.50% |
| 25 (default) | 1.945 | 2.92% |
| 50 | 3.240 | 4.86% |
| 75 | 4.831 | 7.25% |
| 100 | 6.680 | 10.02% |

This confirms the architecture document's claim that a TDI move from 25 to 75 more than triples the base hazard (2.92% → 7.25%, a +148% relative increase from the debt term alone). Layering a single downed dependency ($M_{dep}=4.5$) onto TDI 75 gives $\min(0.65,\, 0.015 \times 4.831 \times 4.5) = \min(0.65, 0.3261) = 32.61\%$ — and two compounding downed dependencies at that same TDI would compute to $0.015 \times 4.831 \times 20.25 \approx 1.467$, which the $P_{max}$ ceiling clamps to the hard cap of **65%**, the maximum single-tick failure probability the engine can ever produce for any service under any condition.

### 2.3 Incident Materialization

When the stochastic check in § 2.2 fires, `_trigger_service_failure` calls `event_generator.build_incident`, which:

- Assigns severity via `severity_for_tier`: `critical` tier → `P1_CRITICAL`; `standard` tier → `P2_HIGH`.
- Sets the service's own `status` to `"down"` for a `P1_CRITICAL` outcome or `"degraded"` for `P2_HIGH` — the severity classification and the service's resulting health state are therefore deterministically linked by tier, not independently randomized.
- Randomizes the failing service's `latency_ms` to a value drawn uniformly from `[850, 2400]` and `error_rate` from `[0.15, 0.85]`, which is what subsequently feeds `unavailability_factor` for that service until it is remediated.
- Selects `root_cause` uniformly from an eight-entry narrative pool and `title` from a four-template pool interpolated with the service's display name (both pools are enumerated in the Audit Ledger Data Dictionary, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`).
- Logs an `INCIDENT_RAISED` audit event (`actor="AUTOMATED_MONITOR"`, `compliance_flag=True`) in the same call.

---

## 3. Formula 3 — Financial Burn Mechanics

### 3.1 Passive Base Burn and Churn Acceleration

Implemented in `effective_passive_burn(user_happiness)`:

$$
B_{eff}(t) = \begin{cases} B_{base} \times M_{churn} = \$975.00/\text{tick} & user\_happiness < 40\% \\ B_{base} = \$650.00/\text{tick} & \text{otherwise} \end{cases}
$$

This is a hard step function, not a smooth ramp: crossing the 40% happiness threshold in either direction instantaneously changes the passive burn rate by exactly \$325.00/tick with no hysteresis band, so a game state oscillating around 40% happiness will show the passive burn line itself oscillating tick-to-tick between \$650 and \$975.

### 3.2 Non-Linear Incident Surcharge

Implemented in `incident_surcharge(severity, elapsed_ticks)`:

$$
\text{IncidentSurcharge}(severity, t) = SeverityBase(severity) \times (1 + g \cdot t)^{\gamma} = SeverityBase \times (1 + 0.08t)^{1.3}
$$

`elapsed_ticks` is bound, per call site in `_apply_budget_burn`, to the incident's own `mttr_seconds` field — which the tick loop increments by exactly 1 for every tick the incident remains in `active` **or** `acknowledged` status (see `_progress_incidents`), regardless of whether an operator has acknowledged it. Acknowledging an incident therefore does not stop its financial bleed; only a successful `apply_mitigation` against its `service_id` does, by transitioning the incident to `resolved` and removing it from the in-memory `incidents` list on the same call. The surcharge for **every** currently `active` or `acknowledged` incident is summed and added to `B_{eff}(t)` in the same tick:

$$
\text{TotalBurn}(t) = B_{eff}(t) + \sum_{inc \,\in\, \text{active} \,\cup\, \text{acknowledged}} \text{IncidentSurcharge}(severity_{inc}, mttr_{inc})
$$

**Worked P1 surcharge growth curve** (base \$800.00):

| Elapsed ticks (MTTR) | Growth factor $(1+0.08t)^{1.3}$ | Surcharge that tick |
|---|---|---|
| 0 | 1.000 | \$800.00 |
| 5 | 1.590 | \$1,271.82 |
| 10 | 2.135 | \$1,708.20 |
| 20 | 3.208 | \$2,566.43 |
| 30 | 4.294 | \$3,435.35 |

This is the per-tick surcharge, not cumulative spend; a P1 left unresolved for 30 consecutive ticks has, by that point, drained a cumulative surcharge total of roughly \$56,000 on top of base burn, illustrating why the platform's economic pressure is dominated by MTTR discipline rather than by the flat passive burn rate.

`_apply_budget_burn` clamps the result with `max(0.0, self.budget - total_burn)` — the budget floor is exactly zero; it is mathematically impossible for `budget` to go negative, which is what makes the `<= 0.0` bankruptcy check in § 1.4 an exact equality-reachable condition rather than a "crossed below" condition that could skip over zero.

---

## 4. Formula 4 — Regulatory Penalties (MTTA Enforcement)

### 4.1 Alert Fatigue Happiness Drain

Implemented in `alert_fatigue_penalty(mtta_ticks)`, applied only to incidents whose `status == "active"` (i.e., not yet acknowledged):

$$
\Delta H_{fatigue}(mtta) = \begin{cases} 1.5 & 5 \le mtta \le 11 \\ 0 & \text{otherwise} \end{cases}
$$

This penalty is applied **per active unacknowledged incident, per tick**, on top of the independent base happiness drift ($-0.7$/tick whenever any service is not `healthy`, or $+0.2$/tick recovery toward a ceiling of 100 when all services are healthy and happiness is below 98). Two simultaneous unacknowledged incidents both sitting inside the `[5, 11]` tick window therefore compound to a $-3.0$ happiness penalty that tick, in addition to the $-0.7$ base drift, floored at an absolute minimum happiness of 0.0 (the fatigue clamp) or 5.0 (the base-drift clamp) depending on which code path applies the floor.

### 4.2 Unattended Alert Breach Fine

Implemented via `is_unattended_breach(mtta_ticks)` returning `mtta_ticks >= UNATTENDED_BREACH_TICK (12)`, consumed in `_progress_incidents`:

$$
\text{Fine}(t) = \begin{cases} \$4{,}500.00 & mtta_{inc}(t) \ge 12 \text{ and } status_{inc} = \text{active} \\ \$0.00 & \text{otherwise} \end{cases}
$$

Because this check runs unconditionally every tick for every still-`active` incident (there is no "fire once" guard), an incident left unacknowledged for 20 ticks accrues the \$4,500 fine on ticks 12 through 20 inclusive — nine separate `UNATTENDED_ALERT_VIOLATION` audit-log entries (each with `compliance_flag=False`) and \$40,500 in cumulative regulatory fines — not a single one-time penalty. The fine is deducted with the same zero-floor clamp described in § 3.2 and is entirely independent of, and additive to, the incident's own MTTR-driven surcharge from § 3.2. The only way to stop the fine from continuing to accrue tick-over-tick is to acknowledge the incident (which flips `status` away from `active`, immediately disqualifying it from this check) or to resolve it outright via a runbook.

### 4.3 Ambient Technical Debt Relief

Not part of the user-specified regulatory-penalty set but directly load-bearing on the TDI term in § 2.2, and therefore documented here for completeness: `_apply_quiet_period_refactor` increments a `quiet_ticks` counter every tick with zero active incidents (any active incident resets the counter to 0), and every 20th consecutive quiet tick (`QUIET_REFACTOR_INTERVAL_TICKS = 20`) reduces `tech_debt` by exactly 1 point (`QUIET_REFACTOR_TDI_RELIEF = 1`), floored at 0, logging a `PROACTIVE_REFACTOR_CYCLE` audit event with `compliance_flag=True`. This is the only mechanism by which technical debt decreases without an operator spending budget on the `rollback` runbook's $-2$ TDI delta (Document 04).

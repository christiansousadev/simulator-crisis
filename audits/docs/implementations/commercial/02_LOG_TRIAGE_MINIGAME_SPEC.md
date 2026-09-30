# Active Log Triage & Root-Cause Investigation Mini-Game — Implementation Specification

**Document ID:** IZ-COMM-02  
**Classification:** Technical Specification / Incident Investigation & Log Triage  
**Status:** Implementado  
**Source of Truth:** `backend/app/engine/simulator.py`, `backend/app/engine/log_generator.py`, `backend/app/engine/formulas.py`, `backend/app/models/incident.py`, `backend/app/api/v1/incidents.py`, `frontend/src/components/modals/LogTriageTerminal.tsx`

---

## 1. System Objective

Transform root-cause identification from a passive flavor narrative into an active investigation mechanic:
1. Synthetic log streams are generated deterministically per incident with a hidden root-cause line.
2. The root cause narrative is masked from public wire payloads (`public_incidents()`) until confirmed by investigation.
3. Player investigation attempts are evaluated server-side, logging real governance timeline facts.
4. Accuracy erodes with erroneous guesses, and incorrect leads inflict cognitive stress on assigned engineers.
5. Confirmed diagnosis unlocks forward-looking mitigation cost discounts and resolution bonuses; historical MTTA/MTTR metrics are never rewritten retroactively.

---

## 2. Synthetic Log Stream & Root Cause Masking

### 2.1 Generation & Persistence
- When an incident is raised (`build_incident` in `event_generator.py`), `generate_incident_log_stream()` creates a synthetic log stream containing `INFO`, `WARN`, `ERROR`, and `FATAL` lines, embedding exactly one marked root-cause line.
- The full stream is persisted in `Incident.log_lines_json` and the key in `Incident.root_cause_line_id`.
- Across restarts, active triage state and evidence streams are restored verbatim without regenerating or altering the log entries.

### 2.2 Server-Side Masking (`public_incidents()`)
- In `SimulationEngine.public_incidents()` (which serializes incidents for REST endpoints and `TICK_BROADCAST`), the answer keys (`log_lines`, `root_cause_line_id`) are stripped from the payload.
- If `triage_solved` is false, `root_cause` is set to `None`. The client cannot inspect or bypass investigation via developer tools.

---

## 3. Investigation Mechanics & Attempt Governance

### 3.1 Investigation Lifecycle (`submit_triage`)
When a player selects a log line in the triage interface:
1. **First Attempt (`INVESTIGATION_STARTED`):**
   - On the initial submission (when `triage_wrong_attempts == 0`), an audit event `INVESTIGATION_STARTED` (`actor="VP_OF_INFRA"`, `compliance_flag=True`) is committed to the ledger under `_db_write_lock`.
2. **Correct Identification (`ROOT_CAUSE_IDENTIFIED`):**
   - If `line_id == inc["root_cause_line_id"]`:
     - Sets `triage_solved = True`.
     - Derives `triage_accuracy = formulas.triage_accuracy(wrong_attempts)`: starts at $1.00$, decreases by $0.22$ per incorrect attempt, bounded at a floor of $0.15$.
     - Logs `ROOT_CAUSE_IDENTIFIED` (`actor="VP_OF_INFRA"`, `compliance_flag=True`) recording `line_id`, `wrong_attempts`, and final `accuracy`.
     - The root cause narrative becomes visible in the incident dossier and UI.
3. **Incorrect Guess (Consequences of Failure):**
   - Increments `triage_wrong_attempts` on the incident.
   - Erodes potential `triage_accuracy` for when the root cause is eventually solved.
   - If an engineer is assigned to the service (`assigned_service_id == incident.service_id`), the engineer incurs a $+3.0\%$ stress penalty (`formulas.TRIAGE_WRONG_ATTEMPT_STRESS = 3.0`) for investigating a false lead.

---

## 4. Mechanical Rewards & Non-Retroactive Invariance

### 4.1 Forward-Looking Mitigation Discount
- In `apply_mitigation()`, a confirmed root cause grants a forward-looking discount scaled by accuracy:
  $$\text{discount} = 0.50 \times \text{triage\_accuracy}$$
  $$\text{effective\_cost} = \text{base\_cost} \times (1.0 - \text{discount})$$
  *(Composes multiplicatively with tech-tree upgrades such as `automated_cicd`.)*
- Mitigation speed factor receives a forward-looking bonus proportional to accuracy.

### 4.2 Non-Retroactive MTTA/MTTR Guarantee
- **Historical MTTA and MTTR are never rewritten or artificially reduced.**
- Elapsed timestamps, acknowledged tick, and duration metrics represent immutable operational history. Confirmed triage accelerates resolution purely by lowering future operational friction and runbook cost, not by altering historical clock records.

---

## 5. UI/UX Interface (`LogTriageTerminal.tsx`)

- **Terminal Presentation:** Monospace CRT-style terminal with log level filters (`INFO`, `WARN`, `ERROR`, `FATAL`).
- **Interactive Feedback:** Visual highlights and procedural Web Audio feedback (keystrokes, buzz on incorrect guess, confirmation chime on root cause discovery).
- **Interface Decoupling:** Sound and visual effects remain strictly presentation-layer behaviors, with no coupling to simulation engine calculations.

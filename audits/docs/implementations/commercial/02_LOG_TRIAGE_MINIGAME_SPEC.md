# Active Log Triage & Root-Cause Investigation Mini-Game — Implementation Specification

**Document ID:** IZ-COMM-02  
**Classification:** Technical Specification / Incident Investigation & Log Triage  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/engine/simulator.py`, `backend/app/engine/log_generator.py`, `backend/app/engine/formulas.py`, `backend/app/models/incident.py`, `backend/app/api/v1/incidents.py`, `frontend/src/components/modals/LogTriageTerminal.tsx`, `frontend/src/utils/triageSelection.ts`

---

## 1. System Objective

Transform root-cause identification from a passive flavor narrative into an active investigation mechanic:
1. A synthetic log stream is generated per incident (procedurally, from randomized pools) with one hidden root-cause line.
2. The root cause narrative is masked from public wire payloads (`public_incidents()`) until confirmed by investigation.
3. Player investigation attempts are evaluated server-side, logging real governance timeline facts.
4. Accuracy erodes with erroneous guesses, and incorrect leads inflict cognitive stress on assigned engineers.
5. Confirmed diagnosis unlocks forward-looking mitigation cost discounts and resolution bonuses; historical MTTA/MTTR metrics are never rewritten retroactively.

---

## 2. Synthetic Log Stream & Root Cause Masking

### 2.1 Generation & Persistence
- When an incident is raised (`build_incident` in `event_generator.py`), `generate_incident_log_stream()` creates a synthetic stream of `LOG_LINE_COUNT = 22` lines (`INFO`/`WARN`/`ERROR`/`FATAL`, weighted 55/25/15/5), each `{id, tick_offset, level, message}`, and replaces one line (at a random index from 3 to 20) with the marked root-cause line. The root-cause message is chosen from the incident's narrative root cause (`ROOT_CAUSE_LOG_MAP`), is always `ERROR` or `FATAL`, and is excluded from the decoy pools so a decoy can never carry identical text. Ids are random (`log-<8 hex>`); the stream is random per incident, not reproducible from a seed.
- The full stream is persisted in `Incident.log_lines_json` and the key in `Incident.root_cause_line_id`.
- Across restarts, active triage state and evidence streams are restored verbatim without regenerating or altering the log entries.

### 2.2 Server-Side Masking (`public_incidents()`)
- In `SimulationEngine.public_incidents()` (which serializes incidents for REST endpoints and `TICK_BROADCAST`), the answer keys (`log_lines`, `root_cause_line_id`) are stripped from the payload.
- If `triage_solved` is false, `root_cause` is set to `None`. The client cannot inspect or bypass investigation via developer tools.
- `GET /api/incidents/{id}/logs` returns only `{ "lines": [...] }` (no flag marks the answer; unknown incident -> 404), and `POST /api/incidents/{id}/triage` with `{line_id}` returns `{success, correct}` (`already_solved` once solved; an unknown incident is HTTP 404).

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
   - If an engineer is assigned to the service (`assigned_service_id == incident.service_id`), the engineer incurs a $+3.0$ stress-point penalty (`formulas.TRIAGE_WRONG_ATTEMPT_STRESS = 3.0`, clamped to 100) for investigating a false lead; with no assigned engineer there is no stress effect (an engineer hired without a service, e.g. through the REST API, is unassigned; see the staff spec § 4.3.2).

Each submission's consequences (audit event, incident update, engineer stress) are committed together under one `_db_write_lock` hold, so a crash cannot leave them half-applied.

---

## 4. Mechanical Rewards & Non-Retroactive Invariance

### 4.1 Forward-Looking Mitigation Discount
- In `apply_mitigation()`, a confirmed root cause on the targeted incident grants a forward-looking discount scaled by accuracy (`TRIAGE_COST_DISCOUNT_MAX = 0.50`):
  $$\text{discount} = 0.50 \times \text{triage\_accuracy}$$
  $$\text{effective\_cost} = \text{base\_cost} \times (1.0 - \text{discount})$$
  *(Composes multiplicatively with tech-tree upgrades such as `automated_cicd`, which is applied first.)* The discount applies in every mode.
- In sandbox and custom runs, the runbook's effectiveness also receives `+ 0.15 x triage_accuracy` (`TRIAGE_EFFECTIVENESS_BONUS_MAX`, together with the specialist term, capped at 1.0), which makes a poorly-fitting runbook more likely to reach the full-resolution threshold. The six scripted scenarios use a fixed effectiveness of 1.0 for permitted runbooks, so this bonus does not apply there.

### 4.2 Non-Retroactive MTTA/MTTR Guarantee
- **Historical MTTA and MTTR are never rewritten or artificially reduced.**
- Elapsed timestamps, acknowledged tick, and duration metrics represent immutable operational history. Confirmed triage accelerates resolution purely by lowering future operational friction and runbook cost, not by altering historical clock records.

---

## 5. UI/UX Interface (`LogTriageTerminal.tsx`)

The terminal is a `system`-layer `Modal` (large, black CRT styling with an emerald frame) stacked above the incident briefing, which stays mounted underneath; closing or finishing returns straight to it ("Back to incident" when it was opened from the briefing).

- **Instruction line and keyboard hint:** the header band states the task ("Click the line that proves the root cause") and the keyboard hint ("up/down to move, Enter to submit").
- **SLA-bleeding meter:** next to the instruction, a live panel shows that the clock is costing money while the player investigates: a gradient bar scaled to the incident's current per-tick surcharge rate (relative to three times its starting rate, so it visibly climbs as the incident ages), the surcharge accrued so far, how many ticks the incident has been open and the current per-tick rate. The accrued amount is read from the incident's `accrued_surcharge` on the wire when present (falling back to a client-side estimate), and the rate curve mirrors `formulas.incident_surcharge` (`utils/incidentSurcharge.ts`); the engine's figure is authoritative and the panel is presentation only.
- **Boot and streaming:** a typewriter boot line (`> attaching to log stream for <short id>...`) plays first, then the lines stream in one every 45 ms with a blinking cursor on the newest. Reduced motion shows everything immediately. A failed fetch shows an error with a Retry button.
- **Filters and counters:** `INFO`/`WARN`/`ERROR`/`FATAL` toggle buttons (a "N hidden by filter" note appears when lines are filtered out), an attempts counter and a live "quality" percentage that mirrors the backend's accuracy curve (`triageAccuracy`: 100% minus 22 points per wrong attempt, floor 15%). Attempts already made on the incident (for example before reopening the terminal) are carried in.
- **Keyboard selection:** the list uses a roving tab stop: `ArrowUp`/`ArrowDown` move the cursor (clamped at both ends, no wrap), `Home`/`End` jump to the ends, and `Enter`/`Space` submit the focused line (each line is a button). Mouse click submits too.
- **Wrong pick:** the line shakes once, is struck through and disabled while the terminal stays open (reopening it resets those local marks, and the engine penalizes every wrong submission, repeats included), the attempts counter bumps, the quality percentage drops and an inline notice reports the new reward quality.
- **Right pick:** the stamp "ROOT CAUSE CONFIRMED" lands over the list (the other lines dim), the confirmed cause text and the reward note are shown, and after about 1.2 s the terminal returns to the incident briefing. A network failure keeps the terminal interactive with an error notice.
- **Audio and effects:** procedural Web Audio feedback (an error buzz on a wrong guess, a success chime on discovery) and the CSS effects are presentation only, with no coupling to engine calculations.

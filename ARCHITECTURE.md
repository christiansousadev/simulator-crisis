# INCIDENTZERO: ARCHITECTURAL BLUEPRINT & SRE CRISIS SIMULATOR SPECIFICATION

## 1. BRANDING & IDENTITY

- **Primary Project Name:** IncidentZero
- **Alternative Candidates:** OutageOps, SLA Breaker: Crisis War Room, StatusPage Zero
- **Tagline:** "Silence the alarms. Defend the SLA. Survive the audit."
- **Visual Motif:** Cyber-industrial mission control, SRE war room telemetry, glowing state nodes, crimson alert pulses, and audit trail ledgers.

### Minimalist SVG Favicon / Logo
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="shieldGrad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="neonPulse" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="50%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#f43f5e" />
    </linearGradient>
  </defs>
  <!-- DEFENSIVE SHIELD CONTAINER -->
  <path d="M32 4L10 14V30C10 44 19 55 32 60C45 55 54 44 54 30V14L32 4Z" fill="url(#shieldGrad)" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round" />
  <!-- RACK NODE CLUSTER -->
  <rect x="20" y="18" width="24" height="6" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.5" />
  <circle cx="25" cy="21" r="1.5" fill="#10b981" />
  <circle cx="30" cy="21" r="1.5" fill="#38bdf8" />
  <rect x="20" y="28" width="24" height="6" rx="2" fill="#1e293b" stroke="#f43f5e" stroke-width="1.5" />
  <circle cx="25" cy="31" r="1.5" fill="#f43f5e" />
  <circle cx="30" cy="31" r="1.5" fill="#f59e0b" />
  <rect x="20" y="38" width="24" height="6" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.5" />
  <circle cx="25" cy="41" r="1.5" fill="#10b981" />
  <circle cx="30" cy="41" r="1.5" fill="#10b981" />
  <!-- PULSE HEARTBEAT OVERLAY -->
  <path d="M16 48L24 48L28 42L33 52L37 45L40 48L48 48" stroke="url(#neonPulse)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
```

---

## 2. COMPLETE DIRECTORY TREE

```text
simulator-crisis/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
├── README.md
├── audits/
│   ├── templates/
│   │   └── post_mortem_template.md
│   └── reports/
│       └── .gitkeep
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py
│       │   └── database.py
│       ├── engine/
│       │   ├── __init__.py
│       │   ├── formulas.py
│       │   ├── event_generator.py
│       │   └── simulator.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── session.py
│       │   ├── service.py
│       │   ├── incident.py
│       │   ├── mitigation.py
│       │   └── audit.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── session.py
│       │   ├── service.py
│       │   ├── incident.py
│       │   ├── mitigation.py
│       │   ├── audit.py
│       │   └── websocket.py
│       └── api/
│           ├── __init__.py
│           ├── router.py
│           └── v1/
│               ├── __init__.py
│               ├── sessions.py
│               ├── services.py
│               ├── incidents.py
│               ├── mitigations.py
│               ├── audits.py
│               └── ws.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── types/
        │   └── game.ts
        ├── store/
        │   └── useGameStore.ts
        ├── hooks/
        │   └── useSimulationSocket.ts
        ├── components/
        │   ├── layout/
        │   │   ├── Topbar.tsx
        │   │   ├── LeftPanel.tsx
        │   │   ├── CenterWarRoom.tsx
        │   │   ├── RightRunbooks.tsx
        │   │   └── BottomAuditDrawer.tsx
        │   └── common/
        │       ├── MetricGauge.tsx
        │       ├── StatusBadge.tsx
        │       └── TerminalLog.tsx
        └── services/
            └── api.ts
```

---

## 3. GAME MECHANICS & SIMULATION ENGINE (FORMULAS & STATE)

### 3.1 Game Loop & Time Scale
- **Base Simulation Tick:** $1.0\text{ second (real-time)} = 1\text{ game hour}$.
- **Sprint Window:** $24\text{ ticks} = 1\text{ game day}$; $720\text{ ticks} = 1\text{ fiscal month (SLA evaluation period)}$.
- **Speed Multipliers:** `0x` (PAUSED), `1x` (1.0s/tick), `2x` (0.5s/tick), `5x` (0.2s/tick).

### 3.2 Core Variables
1. **Budget / Runway ($ USD):**
   - Initial: `$250,000.00`.
   - Passive Burn Rate: `Base Infra ($200/tick) + Engineering Payroll ($450/tick) = $650/tick`.
   - Outage Surcharge: High latency/downtime imposes direct cloud egress & customer SLA refund costs.
   - Failure Condition: `budget <= 0` (Bankruptcy -> Game Over).
2. **Global SLA %:**
   - Target: `99.90%` (Error Budget: `0.10%` = max 43.2 minutes of weighted downtime per 720-tick month).
   - Failure Condition: Rolling window SLA `< 99.00%` (evaluated after 24-tick grace period) triggers regulatory breach (`SLA_BREACH_EMERGENCY_SANCTION`) and emergency Board Review.
3. **User Happiness (0.0 to 100.0%):**
   - Driven by weighted service latency and error rates.
   - If User Happiness `< 40.0%`, customer churn accelerates passive revenue drain.
4. **Technical Debt Index (TDI) (0 to 100 points):**
   - Baseline start: `25`.
   - Rises by choosing quick-and-dirty mitigations (e.g., hot patching prod directly).
   - Decreases by executing architecture refactoring runbooks.
   - Modulates the cascade failure probability across all microservices.

### 3.3 Mathematical Formulas

#### Formula 1: SLA Availability Calculation Per Tick & Rolling Window
Each microservice $i \in \{1, \dots, N\}$ has weight $w_i$:
- $w_i = 3.0$ for **Critical Tier** (Payment Gateway, Auth Service, Database Master).
- $w_i = 1.0$ for **Standard Tier** (Search Indexer, Recommendation Engine, Notification Worker).

Unavailability factor $U_i(t)$ per service:
$$U_i(t) = \begin{cases} 
0.0 & \text{if status is healthy} \\
\min\left(1.0, \frac{\text{latency\_ms} - 200}{1800} \cdot 0.5 + \text{error\_rate} \cdot 0.5\right) & \text{if status is degraded} \\
1.0 & \text{if status is down}
\end{cases}$$

Instantaneous Tick SLA:
$$SLA_{tick}(t) = 1.0 - \frac{\sum_{i=1}^N w_i \cdot U_i(t)}{\sum_{i=1}^N w_i}$$

Rolling Window SLA at tick $t$ (up to 720 samples):
$$SLA_{rolling}(t) = \text{clamp\_percentage}\left(\frac{1}{|W_t|} \sum_{s \in W_t} SLA_{tick}(s)\right) \times 100\%$$

Where $W_t$ is the bounded sliding window (`_sla_window`, maxlen=720 ticks, serialized in `sla_window_json`). Regulatory breach evaluation begins after a 24-tick grace period (`BREACH_GRACE_TICKS = 24`) against `SLA_BREACH_THRESHOLD = 99.00%`.

#### Formula 2: Outage Cascading Probability Based on Technical Debt
Base spontaneous failure probability per healthy service per tick: $P_{base} = 0.012$ (1.2%).
The effective failure probability $P_{failure}(i)$ incorporates the Technical Debt Index (TDI) and upstream dependency health:

$$P_{failure}(i) = P_{base} \cdot \left(1 + \frac{\text{TDI}}{35}\right)^{1.8} \cdot \prod_{d \in \text{Dependencies}(i)} \left(1 + \mathbf{1}_{\{status(d) = \text{down}\}} \cdot 3.0 + \mathbf{1}_{\{status(d) = \text{degraded}\}} \cdot 1.2\right)$$

- If $\text{TDI} = 25$: debt multiplier is $\approx 2.45\times$.
- If $\text{TDI} = 85$: debt multiplier jumps to $\approx 8.12\times$.
- If an upstream dependency is **down**, the cascade multiplier spikes by $+300\%$.

#### Formula 3: MTTA & MTTR Penalty Impact
- **Mean Time to Acknowledge (MTTA):** Ticks elapsed between incident spawn and player acknowledgement.
  - $\text{Ticks} \in [0, 4]$: Standard triage, no panic penalty.
  - $\text{Ticks} \in [5, 12]$: "Unattended Alert" status. User Happiness penalty: $\Delta H = -1.8\text{ pts/tick}$.
  - $\text{Ticks} > 12$: "Executive Escalation". Triggers immediate `$4,500` audit non-compliance fine per tick.
- **Mean Time to Resolve (MTTR):**
  - Continuous downtime accelerates the cost of downtime exponentially:
  $$\text{BurnPenalty}(t) = \text{BaseBurn} + (\text{CostFactor}_{sev} \times t^{1.25})$$
  Where $\text{CostFactor}_{P1} = 850$, $\text{CostFactor}_{P2} = 300$, $\text{CostFactor}_{P3} = 75$.

---

## 4. DATABASE SCHEMA & DATA CONTRACTS (SQL DDL & PYDANTIC)

### 4.1 Standard SQL DDL (PostgreSQL & SQLite Compatible)

```sql
-- GAME SESSIONS TABLE
CREATE TABLE game_sessions (
    id VARCHAR(36) PRIMARY KEY,
    player_name VARCHAR(100) NOT NULL,
    budget DECIMAL(12, 2) NOT NULL DEFAULT 250000.00,
    sla_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    tech_debt INTEGER NOT NULL DEFAULT 25,
    user_happiness DECIMAL(5, 2) NOT NULL DEFAULT 95.00,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    current_tick INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SERVICES TABLE
CREATE TABLE services (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK(tier IN ('critical', 'standard')),
    status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK(status IN ('healthy', 'degraded', 'down')),
    latency_ms INTEGER NOT NULL DEFAULT 45,
    error_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
    dependencies_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

-- INCIDENTS TABLE
CREATE TABLE incidents (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    service_id VARCHAR(36) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK(severity IN ('P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW')),
    title VARCHAR(255) NOT NULL,
    root_cause TEXT NOT NULL,
    mtta_seconds INTEGER NOT NULL DEFAULT 0,
    mttr_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'acknowledged', 'mitigated', 'resolved')),
    created_tick INTEGER NOT NULL,
    acknowledged_tick INTEGER NULL,
    resolved_tick INTEGER NULL,
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- MITIGATION ACTIONS TABLE
CREATE TABLE mitigation_actions (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    cost DECIMAL(10, 2) NOT NULL,
    tech_debt_delta INTEGER NOT NULL,
    resolve_speed_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
    cooldown_ticks INTEGER NOT NULL DEFAULT 5,
    category VARCHAR(50) NOT NULL DEFAULT 'infra'
);

-- AUDIT LOGS TABLE
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tick INTEGER NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(50) NOT NULL,
    details_json TEXT NOT NULL,
    compliance_flag BOOLEAN NOT NULL DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

-- INDEXES FOR WAR ROOM PERFORMANCE
CREATE INDEX idx_services_session ON services(session_id);
CREATE INDEX idx_incidents_session ON incidents(session_id);
CREATE INDEX idx_audit_session ON audit_logs(session_id);
```

### 4.2 Pydantic v2 Models & Contracts

```python
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

class ServiceTier(str, Enum):
    CRITICAL = "critical"
    STANDARD = "standard"

class ServiceStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"

class IncidentSeverity(str, Enum):
    P1_CRITICAL = "P1_CRITICAL"
    P2_HIGH = "P2_HIGH"
    P3_MEDIUM = "P3_MEDIUM"
    P4_LOW = "P4_LOW"

class IncidentStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    MITIGATED = "mitigated"
    RESOLVED = "resolved"

class SessionStatus(str, Enum):
    RUNNING = "running"
    PAUSED = "paused"
    VICTORY = "victory"
    BANKRUPTED = "bankrupted"
    BREACHED = "breached"

# SERVICE SCHEMAS
class ServiceBase(BaseModel):
    name: str
    tier: ServiceTier
    status: ServiceStatus = ServiceStatus.HEALTHY
    latency_ms: int = 45
    error_rate: float = 0.0000
    dependencies: List[str] = Field(default_factory=list)

class ServiceResponse(ServiceBase):
    id: str
    session_id: str
    model_config = ConfigDict(from_attributes=True)

# INCIDENT SCHEMAS
class IncidentBase(BaseModel):
    service_id: str
    severity: IncidentSeverity
    title: str
    root_cause: str

class IncidentResponse(IncidentBase):
    id: str
    session_id: str
    mtta_seconds: int = 0
    mttr_seconds: int = 0
    status: IncidentStatus
    created_tick: int
    acknowledged_tick: Optional[int] = None
    resolved_tick: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

# MITIGATION ACTION SCHEMAS
class MitigationActionResponse(BaseModel):
    id: str
    name: str
    description: str
    cost: float
    tech_debt_delta: int
    resolve_speed_multiplier: float
    cooldown_ticks: int
    category: str
    model_config = ConfigDict(from_attributes=True)

# AUDIT LOG SCHEMAS
class AuditLogResponse(BaseModel):
    id: str
    session_id: str
    timestamp: datetime
    tick: int
    event_type: str
    actor: str
    details: Dict[str, Any]
    compliance_flag: bool
    model_config = ConfigDict(from_attributes=True)

# SESSION SCHEMAS
class GameSessionCreate(BaseModel):
    player_name: str = "VP of Infrastructure"

class GameSessionResponse(BaseModel):
    id: str
    player_name: str
    budget: float
    sla_percentage: float
    tech_debt: int
    user_happiness: float
    status: SessionStatus
    current_tick: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# WEBSOCKET REAL-TIME BROADCAST PAYLOAD
class SimulationTickPayload(BaseModel):
    type: str = "TICK_BROADCAST"
    tick: int
    budget: float
    sla_percentage: float
    tech_debt: int
    user_happiness: float
    services: List[ServiceResponse]
    active_incidents: List[IncidentResponse]
    recent_audits: List[AuditLogResponse]
```

---

## 5. UI/UX WAR-ROOM LAYOUT SPECIFICATION

```
+----------------------------------------------------------------------------------------------------+
| TOPBAR: Live SLA Gauge | MTTR/MTTA | Budget Runway ($) | Speed Controls [||] [1x] [2x] | Audit Score   |
+------------------------------+---------------------------------------+-----------------------------+
| LEFT PANEL (w-1/4)           | CENTER WAR ROOM (flex-1)              | RIGHT RUNBOOKS (w-80)       |
| Service Health & Topology    | Active Alerts & Incident Triage Drawer| Mitigation Action Cards     |
| - Microservices Health Cards | - Real-time Alert Severity Stream     | - Rollback Deployment       |
| - Latency & Error Rate Gauges| - Log Terminal (Stack Trace Ingestion)| - Scale Replicas (+3)       |
| - Cascade Dependency Links   | - One-click Acknowledge / Triage Modal| - Circuit Breaker Toggle    |
|                              |                                       | - Post-Mortem Generator     |
+------------------------------+---------------------------------------+-----------------------------+
| BOTTOM DRAWER (h-48, Collapsible): Live Compliance Stream & SRE Audit Ledger (Terminal aesthetic)  |
+----------------------------------------------------------------------------------------------------+
```

### Layout Wireframe Breakdown (Tailwind CSS Structure)
- **Root Container:**
  `h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden select-none`
- **Topbar (`h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between`):**
  - Left: Logo icon + `font-mono font-bold tracking-wider text-emerald-400` + Session Day/Tick badge (`bg-slate-800 px-3 py-1 rounded text-xs font-mono`).
  - Center Metrics Bar:
    - SLA Gauge: `flex items-center gap-2 font-mono text-sm` with dynamic color (`text-emerald-400` > 99.9%, `text-amber-400` > 99.5%, `text-rose-500` <= 99.5%).
    - MTTR & MTTA: Small badges with timer icons (`lucide-react`).
    - Budget: `font-mono text-lg font-bold text-emerald-300` with subtle green/red delta ticker.
    - Tech Debt Indicator: Progress ring or meter (`text-rose-400`).
  - Right: Game Speed control group (`flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700`).
- **Main Body Grid (`flex-1 flex overflow-hidden`):**
  - **Left Panel (Service Topology):**
    `w-80 border-r border-slate-800/80 bg-slate-900/50 p-4 flex flex-col gap-3 overflow-y-auto`
    - Service Cards: `rounded-lg border p-3.5 transition-all` with glowing border when degraded/down (`border-rose-500/50 bg-rose-950/20` vs `border-slate-800 bg-slate-900`).
    - Metric tags: `flex justify-between font-mono text-xs text-slate-400` showing latency (ms) and error rate (%).
  - **Center Panel (Incident War Room):**
    `flex-1 flex flex-col p-4 gap-4 bg-slate-950/80 overflow-hidden`
    - Top: Active Alarming Incidents table/feed (`border border-slate-800 rounded-xl bg-slate-900/40 p-4 flex-1 flex flex-col`).
    - Severity Badges: P1 (Pulsing Red), P2 (Orange), P3 (Yellow).
    - Interactive "Acknowledge" & "Investigate" buttons with instant optimistic UI update.
    - Bottom Half: Live Telemetry Terminal stream (`bg-black/80 font-mono text-xs p-3 rounded-lg border border-slate-800 text-slate-300 h-44 overflow-y-auto`).
  - **Right Panel (Runbook Actions & Governance):**
    `w-80 border-l border-slate-800/80 bg-slate-900/50 p-4 flex flex-col gap-3 overflow-y-auto`
    - Action Cards: "Rollback Canary", "Drain AZ Traffic", "Emergency Autoscaling", "Hotfix Patch".
    - Each card displays: Cost (`-$2,500`), Tech Debt impact (`+5 TDI` or `-10 TDI`), and execution cooldown bar.
    - Governance Action: "Generate SOX-404 Post-Mortem Report" button.
- **Bottom Drawer (Audit Ledger):**
  `h-44 border-t border-slate-800 bg-slate-950 px-6 py-2 flex flex-col font-mono text-xs`
  - Real-time audit log stream recording every user action with timestamp, actor (`VP_INFRA`), compliance flag, and hash signature.

---

## 6. STARTER BACKEND & FRONTEND IMPLEMENTATION

(Embedded directly in the workspace codebase below).

---

## 7. CLAUDE CODE EXECUTION PLAYBOOK

Detailed in the final section and ready for automated one-shot execution.

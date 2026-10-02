# Boardroom Live Metrics TV & Observer Dashboard — Implementation Specification

**Document ID:** IZ-COMM-03  
**Classification:** Technical Specification / LiveOps & Real-Time Observer Telemetry  
**Status:** Implementado  
**Source of Truth:** `frontend/src/components/office/BoardRoom.tsx`, `frontend/src/components/office/BoardroomMetricsDisplay.tsx`, `frontend/src/components/live-ops/LiveOpsView.tsx`, `frontend/src/store/useGameStore.ts`

---

## 1. System Objective

Give the boardroom's existing `KpiDisplay` wall panel real, moving data instead of static decorative bars, and give the game a second-monitor-friendly spectator surface. Both are pure presentation layers over data the client already receives every tick — no new backend endpoint, table, or WebSocket field is required.

## 2. Rolling Metrics History (Client-Side)

`useGameStore.ts`'s `setTelemetry` gains one additive derived-state append: a capped 60-entry `metricsHistory` array, each entry `{tick, avgLatencyMs, errorRatePct, throughputProxy}`, computed from the just-received `telemetry.services` array (`avgLatencyMs` = mean of `latency_ms` across services, `errorRatePct` = mean `error_rate * 100`, `throughputProxy` = a synthetic but telemetry-derived figure: count of `healthy` services times a fixed nominal RPS constant, so it visibly drops when services degrade). This requires no backend cooperation because every `TICK_BROADCAST` frame already carries the full `services` array the computation needs.

## 3. In-Game Presentation Display

`BoardRoom.tsx`'s existing `<KpiDisplay>` call is replaced by a new `components/office/BoardroomMetricsDisplay.tsx`, an SVG sparkline panel drawing three polylines (latency, throughput, error rate) from `metricsHistory`, each normalized to its own panel-local min/max so all three read clearly on one small wall-mounted screen regardless of absolute scale. When `hasP1` (an existing derived boolean already computed in `IsometricOffice.tsx` and threaded down) is true, the panel's background rect pulses red using the same `animate-beacon-flash` keyframe already defined in `tailwind.config.js` for the server-room emergency beacon — reusing an existing animation rather than defining a new one.

## 4. Standalone Observer Route — `/live-ops`

No routing library is introduced (the project has no `react-router-dom` dependency and none is added, keeping the bundle minimal). `main.tsx` performs one additive, dependency-free branch on `window.location.pathname` before mounting: `"/live-ops"` mounts a new `LiveOpsView` component instead of `App`; every other path mounts `App` exactly as before, so the existing single-page game entry point is completely unaffected.

`components/live-ops/LiveOpsView.tsx` is a self-contained full-screen dashboard: it calls `useSimulationSocket()` itself (the hook is reusable — it only depends on the Zustand store, not on `App`'s component tree) to receive the same live telemetry, then renders large-format gauges (SLA, budget, tech debt, error budget — reusing the existing `ShieldGauge`/`CreditCounter`/`TechDebtMeter`/`ErrorBudgetMeter` components verbatim), an active-alert feed (reusing `IncidentsPanel`'s card layout), and a compliance "audit waterfall" — a vertical scrolling list of `recent_audits` entries color-coded by `compliance_flag`. Nothing in this route can mutate simulation state; it contains no buttons that call a mutating endpoint, making it safe to leave open indefinitely on a second monitor.

## 5. In-Game HUD Telemetry Dock — `MetricsPanel.tsx` & `LiveSparkline.tsx`

While `/live-ops` serves external monitor observers and `BoardroomMetricsDisplay` provides decorative in-world flavor, active operators require direct in-game analytics inside the cockpit HUD:
- **Dedicated Bottom Dock Tab (`dockTab === "metrics"`, Hotkey `[G]`):** Added to `BottomDock.tsx` alongside incidents, directives, and upgrades.
- **`MetricsPanel.tsx` Quad SLO View:** Displays four live Datadog/Grafana-style cards: (1) Availability SLA %, (2) Average Mesh Latency (ms), (3) Systemic Error Rate %, (4) Simulated Traffic Query Throughput (req/s).
- **Interactive Rolling Window (`LiveSparkline.tsx`):** Lightweight SVG polyline charts featuring smooth gradient fills, head-marker pulses, minimum/maximum range calibration, and dynamic status-based coloration (emerald, amber, rose, cyan).

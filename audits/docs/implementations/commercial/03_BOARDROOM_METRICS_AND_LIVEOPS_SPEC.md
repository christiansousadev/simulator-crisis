# Boardroom Live Metrics TV & Observer Dashboard — Implementation Specification

**Document ID:** IZ-COMM-03  
**Classification:** Technical Specification / LiveOps & Real-Time Observer Telemetry  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `frontend/src/components/office/BoardRoom.tsx`, `frontend/src/components/office/BoardroomMetricsDisplay.tsx`, `frontend/src/components/live-ops/LiveOpsView.tsx`, `frontend/src/components/dock/MetricsPanel.tsx`, `frontend/src/components/common/LiveSparkline.tsx`, `frontend/src/store/useGameStore.ts`, `frontend/src/main.tsx`

---

## 1. System Objective

Give the boardroom's wall panel real, moving data instead of static decorative bars, give the cockpit HUD a metrics dock, and give the game a second-monitor-friendly spectator surface. All three are presentation layers over data the client already receives every tick — no new backend endpoint, table, or WebSocket field is required.

## 2. Rolling Metrics History (Client-Side)

`useGameStore.ts`'s `setTelemetry` appends one `MetricsSample` per frame to a capped `metricsHistory` array (`METRICS_HISTORY_LIMIT = 60` entries):

| Field | Definition |
|---|---|
| `tick` | `telemetry.tick` of the frame |
| `avgLatencyMs` | mean of `latency_ms` across `telemetry.services` (0 when there are none) |
| `errorRatePct` | mean of `error_rate * 100` across services |
| `throughputProxy` | a synthetic but telemetry-derived figure: number of `healthy` services times `NOMINAL_RPS_PER_HEALTHY_SERVICE` (220), so it drops visibly when services degrade |
| `sla` | `telemetry.sla_percentage` of the frame (the real rolling SLA series) |

This needs no backend cooperation because every `TICK_BROADCAST` frame already carries the full `services` array and `sla_percentage`. The `sla` field was added so the dock can plot the real availability series; previously the "SLA" card plotted the throughput proxy under the SLA name.

## 3. In-Game Presentation Display (`BoardroomMetricsDisplay.tsx`)

`BoardRoom.tsx` mounts `BoardroomMetricsDisplay` as the wall-mounted TV. It is an SVG panel drawing three polylines from `metricsHistory` — average latency (blue), the throughput proxy (green) and error rate (red) — each normalized to its **own** min/max so all three read clearly on one small screen regardless of absolute scale (a series with fewer than two samples draws nothing). Because of that per-series normalization the panel is a trend illustration, not a calibrated chart; it has no axes or numbers.

The panel's `hasP1` prop receives the boardroom's `redAlert` flag (`useRedAlert()`: the session `status` is `breached`, or a `critical`-tier service is `down`). While it is true the background rect pulses red using the `animate-beacon-flash` keyframe already defined for the server-room emergency beacon.

## 4. Standalone Observer Route — `/live-ops`

No routing library is used. `main.tsx` picks the root component with a single dependency-free check, `window.location.pathname === "/live-ops" ? LiveOpsView : App`; every other path mounts `App`. (The language dictionary is fetched before the first render for both.)

`components/live-ops/LiveOpsView.tsx` is a self-contained full-screen dashboard: it calls `useSimulationSocket()` itself to receive the same live telemetry, then renders, in a four-column grid, the existing `ShieldGauge` (SLA), `ErrorBudgetMeter`, `CreditCounter` and `TechDebtMeter` components; an "Active Alerts" column that embeds `IncidentsPanel`; and a "Compliance Waterfall", a newest-first list of the `recent_audits` entries colour-coded by `compliance_flag`, labelled with the localized event names. The header shows the connection state.

**Read-only observer.** The header carries an `Observer mode — read only` badge. The "Active Alerts" column renders `<IncidentsPanel readOnly />`: the cards keep severity, service, age, impact, lifecycle track and the regulatory countdown, but are plain status cards, with no briefing-opening button, no `IncidentActionButton` (it also accepts `readOnly` and renders nothing) and no resolved-stamp sound. The route mounts only display components (gauges, meters, the incident list, the audit feed) plus the telemetry socket, which only receives; it does not mount `useGameShortcuts` (that is called from `App.tsx`, which this route never renders) or any modal host, so no key press or click can send a command (`LiveOpsView.test.tsx` asserts there are no buttons on the page).

## 5. In-Game HUD Telemetry Dock — `MetricsPanel.tsx` & `LiveSparkline.tsx`

While `/live-ops` serves external monitor observers and `BoardroomMetricsDisplay` provides in-world flavor, active operators get direct analytics inside the cockpit HUD:

- **Dedicated Bottom Dock Tab (`metrics`, hotkey `[G]`):** one of the seven dock tabs (it sits behind the dock's "More" menu).
- **`MetricsPanel.tsx`:** three live metric cards plus a per-service table. The cards are (1) **Availability SLA %**, plotting the real `sla` series of `metricsHistory` on a fixed 95–100 range, with tone and state label from the live value (emerald/"nominal" at >= 99.9, amber/"degraded" at >= 99.0, rose/"breach risk" below); (2) **Average mesh latency** in ms (cyan below 100, amber below 300, rose above); (3) **Systemic error rate** in % (emerald below 1, amber below 5, rose above). The throughput proxy is intentionally not shown in the dock. The table lists every service with its status pill, latency and error rate, headed by the current tick. With no services and no history the panel shows an empty state.
- **`LiveSparkline.tsx`:** a lightweight SVG polyline chart with an optional gradient area fill, a head-marker pulse, min/max calibration and tone-based colouring (emerald, amber, rose, cyan), shared by the cards above.

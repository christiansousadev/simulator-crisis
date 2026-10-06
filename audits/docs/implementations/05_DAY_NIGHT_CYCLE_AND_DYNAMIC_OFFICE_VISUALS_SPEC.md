# Day/Night Cycle and Dynamic Office Visuals — Implementation Specification

**Document ID:** IZ-IMPL-05  
**Classification:** Technical Specification / Office Presentation Layer  
**Status:** Implementado (revisado para a implementação atual; sem medição de FPS)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `frontend/src/utils/officeClock.ts`, `frontend/src/components/office/lighting.ts`, `lightingBus.ts`, `LightingDriver.tsx`, `AmbientLight.tsx`, `SkyLayers.tsx`, `SkylineBackdrop.tsx`, `EmergencyFx.tsx`, `frontend/src/utils/defcon.ts`, `frontend/src/components/office/waypointGraph.ts`, `rosterPlan.ts`, `rosterStage.ts`, `RosterDirector.tsx`, `RosterWalkers.tsx`, `PathfindingEmployee.tsx`, `WanderingEmployee.tsx`, `officeLayout.ts`

> **Revision note.** This document was rewritten against the code as it stands after the UX overhaul. The first version described a six-phase `feColorMatrix` grade, a `dimmed` wall prop and a `PathfindingEmployee` that was specified but not yet used. None of that is how the app works today; those designs survive only as short **Superseded** notes. Companion document for the shared motion/interaction rules: `10_UX_INTERACTION_AND_MOTION_LAYER_SPEC.md` (IZ-IMPL-10).

---

## 1. System Objective

Give the isometric office a continuous sense of time of day and of threat level, and make the hired engineers physically walk through the office along real corridors. Both layers are purely presentational: no backend field, REST route or `TICK_BROADCAST` key was added for them, `isoMath.ts::project()` and the viewBox contract (`-406 -156 1006 640`) are unchanged, and the zone origins are shared constants.

Two inputs drive everything: the tick (1 tick = 1 game hour) and the DEFCON level derived from telemetry (`computeDefconLevel`, `utils/defcon.ts`). Nothing in this document is persisted.

---

## 2. Day/Night and Threat Lighting

### 2.1 Clock mapping

`utils/officeClock.ts` is the single source for tick → hour. `Topbar.tsx` (clock readout), `ScreenTransition.tsx` (shift banner), `TitleScreen.tsx`, `LightingDriver.tsx` and `EngineerDesk.tsx` all import it.

| Function | Behaviour |
|---|---|
| `START_HOUR = 8` | Tick 0 reads **08:00**, so a fresh session opens on a bright office. Presentational only; the backend never sees the offset. |
| `getHourOfDay(tick)` | `((tick + START_HOUR) % 24 + 24) % 24` |
| `getDayNumber(tick)` | `floor((tick + START_HOUR) / 24) + 1` |
| `getDayPhase(hour)` | Six discrete labels (`dawn`, `morning`, `noon`, `afternoon`, `dusk`, `night`; night = 22:00–05:00). **No longer drives any lighting**; it is only used through `isNightHour` (`officeLifeUtils.ts`) to enlarge the desk-monitor glow in `EngineerDesk.tsx`. |
| `getDaylight(hour)` | Continuous 0..1 sunlight. |
| `getNightIntensity(hour)` | `1 - getDaylight(hour)`. |
| `getTwilight(hour)` | Warm dawn/dusk term: `max(0, 1 - |2·daylight - 1|) ^ 1.5` (zero at full night and full day). |

### 2.2 Continuous daylight curve

`getDaylight` interpolates between keyframes with a smoothstep, so there are no kinks and no phase steps:

| Hour | 0 | 4.5 | 6.5 | 8 | 10 | 15.5 | 17.5 | 19 | 20.5 | 22 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Daylight | 0 | 0 | 0.45 | 0.96 | 1 | 1 | 0.82 | 0.4 | 0.08 | 0 | 0 |

Covered by `utils/officeClock.test.ts` (the `START_HOUR` offset, day rollover and the curve).

### 2.3 Lighting model, driver and bus

Pure model — `components/office/lighting.ts` (no React, no DOM):

- `computeLightTargets(hour, level)` returns `night`, `twilight`, `pool` (DEFCON 4 and worse), `amber` (DEFCON 3), `alert` (DEFCON 2 and worse) and `alertDepth` (1 at DEFCON 1, 0.85 at DEFCON 2).
- `stepLighting(runtime, targets, dtMs)` eases a smoothed `LightState` toward those targets. Day/night values use an exponential ease (`NIGHT_TAU_MS = 3000`), so 5x speed never strobes the scene. The amber values use a 1.2 s time constant.
- `snapLightState(targets)` returns the final state with no easing (reduced motion, hidden tab, first paint). `isLightingSettled` lets the loop sleep.
- `lightVars(state)` converts the state to CSS custom properties: `--night`, `--twilight`, `--pool`, `--amber`, `--alert-dark`, `--beacons`, `--sweep`, `--lights`, `--emit`. `--emit` is how bright emissive things read (faint by day, strong at night and under emergency power).

Runtime — `LightingDriver.tsx` renders nothing. It subscribes to the store, but only re-targets when the key `tick|defconLevel` changes, then runs a `requestAnimationFrame` loop that publishes through `lightingBus.ts` and stops as soon as the state has settled. There is **no React state** involved, so a lighting change never re-renders the scene. `reduced motion` or a hidden tab snaps straight to the targets (`isReducedMotionNow()`, `document.hidden`).

Bus — `lightingBus.ts` keeps a registry of "light scopes". An element becomes a scope through the `useLightScope()` ref callback; the driver writes the CSS variables only onto those few elements (the sky wrapper, `FloorPools`, `AmbientLightOverlay`, `EmissiveLayer`), never onto the whole office container, so a lighting frame only restyles their small subtrees.

### 2.4 Layers

| Layer | File | What it does |
|---|---|---|
| Sky | `SkyLayers.tsx` + `.office-sky-night` / `.office-sky-dusk` in `index.css` | Two absolutely positioned gradients whose **opacity** follows `--night` and `--twilight`, over the daytime gradient on `.office-sky::before`. Opacity-only, so no gradient repaint. |
| Skyline | `SkylineBackdrop.tsx` | Three depth bands of silhouettes; window panes fade in as `clamp(0, (--night − 0.3) × 2.2, 1)`; warm-white / soft-cyan panes with a per-cell intensity hash; blinking red aviation beacons on the near towers; parallax driven by the camera (translate only, max 26 px). |
| Floor pools | `AmbientLight.tsx::FloorPools` | Cyan server pool, an amber pool at DEFCON ≤ 4, a pulsing red pool in a red alert, warm lamp pools over the engineering desks and the boardroom screen glow; opacities are `calc()` expressions over the variables. |
| Darkness overlay | `AmbientLight.tsx::AmbientLightOverlay` | Plain translucent polygons over floor and walls (`#0a1226` × `--night`, orange twilight tint, near-black emergency wash, a faint pulsing dark-red layer). |
| Emissive layer | `AmbientLight.tsx::EmissiveLayer` | Drawn **after** the overlay so rack glows, desk monitor glows (`--emit`) and the DEFCON beacon rig cut through the dark. The beacon rig stays mounted for 700 ms after the alert ends (`usePresenceFlag`) so its fade-out can finish. |
| Desk glow at night | `EngineerDesk.tsx` | The monitor glow ellipse grows (22×11 instead of 15×7) and brightens (0.3 instead of 0.12) when `isNightHour`. |

Paint order in `IsometricOffice.tsx`: `StaticFloor` → `FloorPools` → decor → cables → props → racks/desks → rooms → `AmbientLightOverlay` → `EmissiveLayer`, all inside the camera rig `<g>`. The static layers are `memo`ed with no props or subscriptions.

### 2.5 DEFCON tiers and the staged red alert

`defconLightingTier(level)` (`utils/defcon.ts`) is the one rule every consumer shares:

| DEFCON | Tier | Lighting |
|---|---|---|
| 5 | `nominal` | Day/night only. |
| 4 | `watch` | Faint amber pool over the vault. |
| 3 | `warning` | Amber pool plus slow amber beacons. |
| 2, 1 | `alert` | Red alert; `alertDepth` 0.85 at DEFCON 2 and 1.0 at DEFCON 1. |

The red alert is **staged**, not a single filter swap (constants in `lighting.ts`):

1. First 150 ms (`ALERT_FLICKER_MS`): hard on/off flickers (`alertFlicker`), like emergency power kicking in.
2. After the flicker: the darkening approaches `alertDepth` over 150 ms and the beacons scale in over 250 ms.
3. From 400 ms: the rotating sweep fades in over 300 ms. Normal lights drop to 0.35 (`EMERGENCY_LIGHTS`) over 400 ms.
4. On exit: the alert wash, beacons and sweep fade over 500 ms; the normal lights restore only after a further 500 ms, over about 1.2 s.

`lighting.test.ts` covers the targets, the easing, the flicker and the exit order. The beacon geometry (`AlertBeacon`, `floorWallPath`) lives in `EmergencyFx.tsx`.

> **Two different "red alert" signals exist, on purpose.** The *lighting* rig follows the DEFCON tier above (DEFCON ≤ 2). The *NPC reaction* (ambient characters stop and face the vault; the boardroom reacts) follows `hooks/useRedAlert.ts`: a critical-tier service is `down` or the SLA status is `breached`. They usually coincide but are not the same predicate.

### 2.6 Performance notes

- No SVG filter elements and no SMIL anywhere in the office (see §4). The scene-wide `feColorMatrix` pass was removed because it forced a full offscreen pass on every repaint.
- Lighting variables are written to four small scopes, not the container.
- `.office-paused` (set by `IsometricOffice.tsx` when the tab is hidden or the scene is off screen via `IntersectionObserver`) pauses every looping CSS animation in the scene.
- **Not measured:** no FPS or frame-time profile exists for the lighting layers. The claims above are structural (what is and is not re-rendered or repainted), not benchmark results.

### 2.7 Superseded

- **Superseded — `officeDayNightGrade` filter.** A single `<filter>` with six per-phase 5×4 colour matrices, switched by a `useEffect` on `DayPhase`, was the original day/night design. It is gone; there is no `feColorMatrix` in the scene. `AmbientLight.tsx` documents the removal in its own header comment.
- **Superseded — `RED_ALERT_GRADE_MATRIX`, `RedAlertOverlay` and `EmergencyBeacon`.** Replaced by the staged model in §2.5 (`AlertBeacon` plus the overlay layers).
- **Superseded — `data-day-phase` on the office container.** `.office-sky` no longer retints a single gradient per phase; the night and dusk layers cross-fade by opacity (§2.4).
- **Superseded — `PerimeterWalls` `dimmed` prop.** Removed; `PerimeterWalls.tsx` states that night is handled by the overlay. The walls are now `memo`ed.
- **Superseded — cyan/emerald monitor `glowColor` per desk index at night.** Desk screen colour now comes from live state (`deskScreenColor`: service status, investigating, mitigating, engineer present).

---

## 3. Movement: the Roster Walks the Office

### 3.1 Three kinds of mover

| Mover | Component | Driven by |
|---|---|---|
| Hired engineers (the roster) | `PathfindingEmployee.tsx`, painted by `RosterWalkers.tsx` | `rosterStage.ts` walking a path over `waypointGraph.ts`, fed by `RosterDirector.tsx` from telemetry |
| Lounge NPCs (up to two, shown by morale thresholds) and a corridor patroller | `WanderingEmployee.tsx` | A fixed waypoint loop on a timer; no graph |
| Seated/animated props (ping-pong ball, door, clock hands) | `OfficeProps.tsx`, `BreakRoom.tsx`, `officeLife.css` | State or CSS |

`PathfindingEmployee` is **in use**: it is the sprite for every hired engineer. It no longer takes `currentNodeId` / `targetNodeId` props and no longer walks by itself; it receives a `WalkerView` (position, hop duration, facing, seated, band, place) and turns it into an `OfficeWorker` whose mood follows live telemetry (stress, stamina, the incident on the service, an acknowledge or mitigation in flight).

### 3.2 Waypoint graph

`waypointGraph.ts` builds a bidirectional graph from the real layout (`officeLayout.ts`), not from hand-placed coordinates:

- A vertical spine west of the desks (`SPINE_X = 9.75`) joins the aisles (rows at y 2.4, 4.9, 6.95), the mid-floor road (y 5.55) and the main hall (y 8.4).
- Each assigned desk has `aisle-*` → `approach-*` → `seat-<service>` nodes (`seat: true`, elevated by `SEAT_Z`); reserve desks have `seat-reserve-<n>`.
- The hall continues east to reception (`hall-east`, `reception-west`, `reception-front`, `entrance`).
- The lounge is entered through `lounge-door` → `lounge-mid`, with coffee, table and two sofa seats.
- The vault: `mid-spine` → `mid-door` → `server-room-door` → `server-room-front`, then a rack aisle at y 3.5 with one `rack-front-<service>` stand per rack (sorted by x so the chain never doubles back).
- **Door fix.** The `server-room-door` node used to sit at (2.3, 8.6) in the boardroom hallway; it is now derived from `SERVER_ROOM_DOOR` = origin + `SERVER_DOOR_OFFSET` = (3.9, 4.05), the real sliding door. `waypointGraph.test.ts` pins both the numbers and that every destination is reachable from the entrance, and samples every edge against the furniture footprints (`walkBlockers`) so a sprite following an edge cannot clip a desk, rack or sofa.

`findPath` is a plain A* with a linear open-set scan (the graph has well under 100 nodes). It returns `[]` for a missing node or no route; callers fall back (§3.4). `hopDurationMs` gives a constant walking speed (`WALK_SPEED_TILES_PER_S = 1.5`, minimum hop 220 ms) so motion reads as walking, not hopping. `facingForMove` derives left/right from the isometric screen-x delta.

### 3.3 Planning (pure)

`rosterPlan.ts`, no React and no timers:

- `deriveIntent`: `resting` / `off_duty` → lounge; assigned service has an `acknowledged` or `mitigated` incident → incident (stand at the rack); otherwise desk.
- `assignSeats`: oldest hire first; the first engineer assigned to a service takes its desk, everyone else takes a reserve desk in order; none left → lounge.
- `planTargets` gives one destination per engineer (lounge spots fill in order; only the coffee spot holds a mug).
- `bandOf(x, y)` assigns a painter layer (`w0`, `w1`, `w2`, `lounge`) so a walking sprite is drawn just behind the furniture in front of it.
- `appearanceFor(id)` hashes the engineer id to a stable look.

### 3.4 Choreography

`rosterStage.ts` (`RosterChoreographer`, a small Zustand store `useRosterStage`) advances each walker hop by hop with **plain JS timers**, so it keeps walking while the simulation is paused. `RosterDirector.tsx` calls `sync()` only when who-is-where can change (roster membership, duty status, which services have a picked-up incident, reduced motion), never on a plain tick.

- A hire at most `FRESH_HIRE_TICKS = 2` ticks old enters at `entrance`, walks to `reception-front`, pauses `CHECK_IN_PAUSE_MS = 1100` (bumps `checkIns`), then walks on.
- Before a hop that crosses into another painter band the sprite stops, hands over (`HANDOFF_MS = 90`) and continues; `busyUntil` stops a re-plan from cutting a hop in half.
- `serverRoomOccupied` is true while somebody stands at a vault node (the vault door opens for them).
- **Reduced motion:** `sync(..., { instant: true })` places everyone at their destination without walking.
- **Broken graph:** if any leg has no path, the sprite is placed at its target instead of being stranded; this is an authoring gap, not a silent success.
- A desk nobody is assigned to shows a quiet vacancy marker (`t.officeLife.vacantDesk` in `EngineerDesk.tsx`) instead of an invented occupant. Clicking a seated engineer selects its service.

### 3.5 Ambient NPCs (`WanderingEmployee`)

Still a timer-driven loop through fixed waypoints (lounge pair in `BreakRoom.tsx`, corridor patroller in `IsometricOffice.tsx`). Current behaviour: skips morale-gated waypoints, sits on a sofa waypoint for real (`z = 0.2`), stops and faces the vault while `useRedAlert()` is true, and stays still under reduced motion. `onActionChange` fires after the walk transition so `BreakRoom` shows the ping-pong ball only while the second NPC is actually at the table (`employeeBAction === "pingpong"`).

History kept short: a stale-closure bug that froze these NPCs at their first waypoint (the interval depended on the drifting `happiness` value) was fixed by reading `happiness`, `redAlert` and the waypoint list through refs; `isoMath.boxFaces` chamfers box corners and `OfficeWorker` has a real walk cycle and blinking eyes. `isoMath.ts` also now memoizes `shade()`; `project()` is unchanged.

### 3.6 Known limitation

Scene geometry is duplicated: `officeLayout.ts` (roster/pathfinding) states in its header that its zone origins are copied from the scene and "kept in sync" by hand; `sceneLayout.ts` holds the scene/camera/lighting copies (including a second `DESK_ORDER` / `DESK_SLOTS`). `waypointGraph.test.ts` and `sceneLayout.test.ts` guard some of it, but nothing enforces that the two files agree.

---

## 4. Non-Breaking Compliance Checklist

- [x] `isoMath.ts::project()` and the viewBox are unchanged. (`isoMath.ts` did gain chamfered faces and a `shade()` cache; neither touches projection.)
- [x] No backend endpoint, table or `TICK_BROADCAST` field was added for the lighting or movement systems. (The unrelated `POST /api/tutorial/incident` belongs to the tutorial, see IZ-IMPL-10.)
- [x] `Topbar.tsx` still prints `Day N · HH:00`; its arithmetic comes from `officeClock.ts`. Note the displayed hour now starts at 08:00.
- [x] No SVG `<filter>`/`feColorMatrix` element and no SMIL `<animate>` remain in the office scene (verified by search of `frontend/src`; the only SMIL mention is a comment in `CascadeRipple.tsx`). A few small CSS `drop-shadow()` glows on rack LEDs in `ServerRack.tsx` do remain.
- [x] The lighting driver holds no React state and writes CSS variables to four scopes only.
- [x] Reduced motion: lighting snaps, the roster teleports, ambient NPCs stand still, the camera snaps.
- [x] `PathfindingEmployee.tsx` is used by the app (via `RosterWalkers`); `WanderingEmployee.tsx` is **not** untouched any more (reduced motion, red-alert behaviour, seating, refs).
- [ ] Frame-rate impact of the overlay/emissive layers: **not measured**.

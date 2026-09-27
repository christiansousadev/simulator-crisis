import { Crosshair, Hammer } from "lucide-react";
import type { MouseEvent, WheelEvent } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { InfrastructureNodeType } from "../../types/game";
import { DayPhase, getDayPhase, getHourOfDay } from "../../utils/officeClock";
import ObjectiveHint from "../common/ObjectiveHint";
import BoardRoom from "./BoardRoom";
import BreakRoom from "./BreakRoom";
import BuildModeOverlay from "./BuildModeOverlay";
import CableTray, { computeNetworkHealth } from "./CableTray";
import { EmergencyBeacon, RedAlertOverlay } from "./EmergencyFx";
import EngineeringFloor from "./EngineeringFloor";
import { BoardroomRug, BreakroomTiles, EntranceMat, HazardBorder, ServerRoomTiles, WalkwayGuide } from "./FloorDecals";
import GlassWall from "./GlassWall";
import InfrastructureNodeSprite from "./InfrastructureNodeSprite";
import IsoBox from "./IsoBox";
import NodeInspector from "./NodeInspector";
import OfficeTooltip from "./OfficeTooltip";
import { MeetingNook, OfficePlant, Sofa, WallClock, WasteBin } from "./OfficeProps";
import PerimeterWalls from "./PerimeterWalls";
import ReceptionLobby from "./ReceptionLobby";
import ServerRoom from "./ServerRoom";
import SkylineBackdrop from "./SkylineBackdrop";
import WanderingEmployee from "./WanderingEmployee";
import { project } from "./isoMath";

// ambient patrol loop through the central corridor and the once-barren right-side gap
const CORRIDOR_PATROL_WAYPOINTS = [
  { x: 8.6, y: 6.2, action: "walk" as const },
  { x: 14.0, y: 6.5, action: "walk" as const },
  { x: 17.5, y: 7.0, action: "walk" as const },
  { x: 14.0, y: 8.0, action: "walk" as const },
];

// mirrors app.engine.infrastructure.INFRASTRUCTURE_CATALOG's requires_producer flag
const REQUIRES_PRODUCER: Record<InfrastructureNodeType, boolean> = {
  redis_cache: false,
  kafka_queue: true,
  db_read_replica: false,
  nginx_lb: false,
};

// day/night color grade matrices per phase, applied via feColorMatrix on the whole office group
const GRADE_MATRICES: Record<DayPhase, string> = {
  dawn: "0.95 0.05 0.10 0 0.02   0.05 0.92 0.08 0 0.01   0.15 0.10 1.05 0 0.03   0 0 0 1 0",
  morning: "1.00 0.00 0.00 0 0.00   0.00 1.00 0.00 0 0.00   0.00 0.00 1.00 0 0.00   0 0 0 1 0",
  noon: "1.05 0.00 0.00 0 0.02   0.00 1.05 0.00 0 0.02   0.00 0.00 0.98 0 0.00   0 0 0 1 0",
  afternoon: "1.02 0.02 0.00 0 0.01   0.02 1.00 0.00 0 0.00   0.00 0.00 0.95 0 0.00   0 0 0 1 0",
  dusk: "1.10 0.05 0.00 0 0.03   0.05 0.85 0.05 0 0.01   0.00 0.10 0.90 0 0.02   0 0 0 1 0",
  night: "0.55 0.05 0.15 0 0.00   0.05 0.60 0.20 0 0.00   0.15 0.20 0.85 0 0.02   0 0 0 1 0",
};

// defcon red-alert grade: heavily desaturated, pushed cool/navy and darkened overall so the
// office reads as running on emergency power -- deep blacks with the beacons as the only real
// light source, instead of the old flat pink/salmon wash from a translucent red overlay
const RED_ALERT_GRADE_MATRIX =
  "0.32 0.04 0.04 0 0.00   0.04 0.30 0.05 0 0.00   0.05 0.05 0.44 0 0.01   0 0 0 1 0";

// grid origins for each office zone across the expanded ~22x14 tile floor plan
const SERVER_ROOM_ORIGIN = { x: 0.5, y: 0.5 };
const ENGINEERING_ORIGIN = { x: 9.9, y: 0.5 };
const BOARDROOM_ORIGIN = { x: 0.5, y: 9.0 };
const BREAKROOM_ORIGIN = { x: 8.2, y: 9.0 };
const RECEPTION_ORIGIN = { x: 17.0, y: 11.2 };

const SERVER_ROOM_SIZE = { width: 7.4, depth: 3.6 };
const BOARDROOM_RUG = { originX: BOARDROOM_ORIGIN.x + 0.3, originY: BOARDROOM_ORIGIN.y + 0.4, width: 3.2, depth: 1.7 };
const BREAKROOM_SIZE = { width: 3.6, depth: 2.2 };
const RECEPTION_MAT = { originX: RECEPTION_ORIGIN.x - 0.3, originY: RECEPTION_ORIGIN.y - 0.3, width: 2.6, depth: 2.4 };

// single continuous floor bounds, covering every zone plus generous walkway space
const FLOOR = { minX: -0.5, minY: -0.5, maxX: 22.5, maxY: 14.5 };
const WOOD_COLOR = "#c9a066";
const WALL_HEIGHT = 2.8;

// PARQUET WOOD FLOOR: ONE FLAT SLAB PLUS PLANK SEAM LINES FOLLOWING THE ISO GRID
function ParquetFloor() {
  const lines = [];
  for (let gx = Math.ceil(FLOOR.minX); gx <= FLOOR.maxX; gx++) {
    const a = project(gx, FLOOR.minY, 0.021);
    const b = project(gx, FLOOR.maxY, 0.021);
    lines.push(<line key={`x${gx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(120,90,50,0.16)" strokeWidth={0.5} />);
  }
  for (let gy = Math.ceil(FLOOR.minY); gy <= FLOOR.maxY; gy++) {
    const a = project(FLOOR.minX, gy, 0.021);
    const b = project(FLOOR.maxX, gy, 0.021);
    lines.push(<line key={`y${gy}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(120,90,50,0.16)" strokeWidth={0.5} />);
  }
  return (
    <g>
      <IsoBox x={FLOOR.minX} y={FLOOR.minY} z={0} w={FLOOR.maxX - FLOOR.minX} d={FLOOR.maxY - FLOOR.minY} h={0.02} color={WOOD_COLOR} topFactor={1.05} rightFactor={0.85} leftFactor={0.65} />
      {lines}
    </g>
  );
}

// structural pedestal beneath the whole floor plan: a solid concrete slab dropping straight down
// from ground level, so the office reads as an architectural cutaway diorama sitting on real mass
// instead of a sheet of paper floating in the void
const FOUNDATION_DEPTH = 0.65;
const FOUNDATION_COLOR = "#1e293b";
const FOUNDATION_DIVIDER_COUNT_X = 11;
const FOUNDATION_DIVIDER_COUNT_Y = 7;

function FoundationBlock() {
  const width = FLOOR.maxX - FLOOR.minX;
  const depth = FLOOR.maxY - FLOOR.minY;

  // vertical support-beam lines on the two visible faces, simulating cast concrete pilasters
  const rightFaceLines = [];
  for (let i = 1; i < FOUNDATION_DIVIDER_COUNT_X; i++) {
    const gx = FLOOR.minX + (width * i) / FOUNDATION_DIVIDER_COUNT_X;
    const top = project(gx, FLOOR.maxY, 0);
    const bottom = project(gx, FLOOR.maxY, -FOUNDATION_DEPTH);
    rightFaceLines.push(
      <line key={`fr${i}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
    );
  }
  const leftFaceLines = [];
  for (let i = 1; i < FOUNDATION_DIVIDER_COUNT_Y; i++) {
    const gy = FLOOR.minY + (depth * i) / FOUNDATION_DIVIDER_COUNT_Y;
    const top = project(FLOOR.maxX, gy, 0);
    const bottom = project(FLOOR.maxX, gy, -FOUNDATION_DEPTH);
    leftFaceLines.push(
      <line key={`fl${i}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} />
    );
  }

  return (
    <g>
      <IsoBox
        x={FLOOR.minX}
        y={FLOOR.minY}
        z={-FOUNDATION_DEPTH}
        w={width}
        d={depth}
        h={FOUNDATION_DEPTH}
        color={FOUNDATION_COLOR}
        topFactor={0.9}
        rightFactor={0.6}
        leftFactor={0.42}
      />
      {rightFaceLines}
      {leftFaceLines}
    </g>
  );
}

// broad, soft contact shadow beneath the entire diorama, grounding it with real physical weight
function MasterGroundShadow() {
  const center = project((FLOOR.minX + FLOOR.maxX) / 2, (FLOOR.minY + FLOOR.maxY) / 2, -FOUNDATION_DEPTH - 0.01);
  return <ellipse cx={center.x} cy={center.y + 40} rx={560} ry={170} fill="url(#groundShadowGradient)" opacity={0.9} />;
}

interface HoverState {
  serviceId: string;
  x: number;
  y: number;
}

// camera: mouse-wheel zoom plus left/right-drag pan over the fixed isometric scene
const CAMERA_MIN_SCALE = 0.75;
const CAMERA_MAX_SCALE = 2.0;
const CAMERA_DRAG_THRESHOLD_PX = 4;
// fixed zoom/pan anchor, roughly the visual center of the whole floor plan
const CAMERA_ORIGIN = project(11, 7, 0);

interface DragState {
  dragging: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

// FULL-BLEED 2.5D ISOMETRIC OFFICE FLOOR, THE MAIN GAME VIEW
export default function IsometricOffice() {
  const t = useTranslation();
  const services = useGameStore((s) => s.telemetry.services);
  const infrastructureNodes = useGameStore((s) => s.telemetry.infrastructure_nodes);
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const buildModeActive = useGameStore((s) => s.buildModeActive);
  const toggleBuildMode = useGameStore((s) => s.toggleBuildMode);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const sessionStatus = useGameStore((s) => s.telemetry.status);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [armedNodeType, setArmedNodeType] = useState<InfrastructureNodeType | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const [cameraSmooth, setCameraSmooth] = useState(false);
  const dragRef = useRef<DragState>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const dayPhase = getDayPhase(getHourOfDay(currentTick));

  // a critical-tier service going down is exactly how the backend classifies a p1 incident
  const hasP1 = services.some((s) => s.tier === "critical" && s.status === "down");
  // defcon/red-alert lighting rig: any live p1, or a confirmed sla breach, puts the office on emergency power
  const redAlert = hasP1 || sessionStatus === "breached";
  const hoveredService = hover ? services.find((s) => s.id === hover.serviceId) : undefined;

  // mouse-wheel zoom, clamped to a sane range around the office's visual center
  const handleWheelZoom = (evt: WheelEvent<HTMLDivElement>) => {
    evt.preventDefault();
    setCameraSmooth(false);
    setCamera((c) => ({
      ...c,
      scale: Math.min(CAMERA_MAX_SCALE, Math.max(CAMERA_MIN_SCALE, c.scale - evt.deltaY * 0.0012)),
    }));
  };

  // left or right mouse button starts a drag-to-pan; a short-lived, unmoved press still reads as a click
  const handlePanStart = (evt: MouseEvent) => {
    if (evt.button !== 0 && evt.button !== 2) return;
    dragRef.current = { dragging: true, startX: evt.clientX, startY: evt.clientY, originX: camera.x, originY: camera.y, moved: false };
  };
  const handlePanMove = (evt: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const dx = evt.clientX - drag.startX;
    const dy = evt.clientY - drag.startY;
    if (Math.abs(dx) > CAMERA_DRAG_THRESHOLD_PX || Math.abs(dy) > CAMERA_DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) {
      setCameraSmooth(false);
      setCamera((c) => ({ ...c, x: drag.originX + dx, y: drag.originY + dy }));
    }
  };
  const handlePanEnd = () => {
    dragRef.current.dragging = false;
  };

  // smooth-pans and zooms the camera onto the server vault, the origin of every p1 incident
  const handleCenterOnCrisis = () => {
    const target = project(SERVER_ROOM_ORIGIN.x + SERVER_ROOM_SIZE.width / 2, SERVER_ROOM_ORIGIN.y + SERVER_ROOM_SIZE.depth / 2, 0.5);
    const scale = 1.5;
    setCameraSmooth(true);
    setCamera({ scale, x: -scale * (target.x - CAMERA_ORIGIN.x), y: -scale * (target.y - CAMERA_ORIGIN.y) });
  };

  const handleHover = (serviceId: string, evt: MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ serviceId, x: evt.clientX - rect.left, y: evt.clientY - rect.top });
  };
  const handleLeave = () => setHover(null);

  const handleArmNode = (nodeType: InfrastructureNodeType) => {
    setArmedNodeType(nodeType);
    setPendingTargetId(null);
  };
  const handleCancelBuild = () => {
    setArmedNodeType(null);
    setPendingTargetId(null);
  };

  const shelfCount = infrastructureNodes.length;
  const handleServiceSelect = async (serviceId: string) => {
    if (!buildModeActive || !armedNodeType) {
      selectService(serviceId);
      return;
    }
    const needsProducer = REQUIRES_PRODUCER[armedNodeType];
    if (needsProducer && !pendingTargetId) {
      // first click picks the protected consumer, second click picks the decoupled producer
      setPendingTargetId(serviceId);
      return;
    }
    const targetId = needsProducer ? pendingTargetId! : serviceId;
    const producerId = needsProducer ? serviceId : undefined;
    const gridX = SERVER_ROOM_ORIGIN.x + 0.5 + (shelfCount % 4) * 1.0;
    const gridY = SERVER_ROOM_ORIGIN.y + 3.3 + Math.floor(shelfCount / 4) * 0.6;
    try {
      await api.placeInfrastructureNode(armedNodeType, gridX, gridY, targetId, producerId);
      pushFloatingText(t.buildMode.placed, "success");
    } catch {
      pushFloatingText(t.buildMode.placementFailed, "danger");
    }
    setArmedNodeType(null);
    setPendingTargetId(null);
  };

  // clicking any empty patch of canvas dismisses the inspector drawer; racks and desks stop this bubble themselves.
  // a drag that just finished panning the camera must not also register as a deselecting click.
  const handleCanvasClick = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    selectService(null);
  };

  return (
    <div
      ref={containerRef}
      data-tour="office-canvas"
      data-day-phase={dayPhase}
      className="relative flex-1 office-sky overflow-hidden"
      onClick={handleCanvasClick}
      onWheel={handleWheelZoom}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <SkylineBackdrop dayPhase={dayPhase} />
      <svg viewBox="-406 -156 1006 640" className="relative z-10 w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="groundShadowGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(15,23,42,0.32)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0)" />
          </radialGradient>
          {/* day/night color grade, matrix swapped reactively as the tick-derived phase changes.
              a live p1/breach overrides the day-phase matrix entirely with a desaturated, cool
              navy grade so red alert reads as "emergency power", not a pink/salmon wash. */}
          <filter id="officeDayNightGrade" x="-5%" y="-5%" width="110%" height="110%">
            <feColorMatrix type="matrix" values={redAlert ? RED_ALERT_GRADE_MATRIX : GRADE_MATRICES[dayPhase]}>
              <animate
                attributeName="values"
                to={redAlert ? RED_ALERT_GRADE_MATRIX : GRADE_MATRICES[dayPhase]}
                dur={redAlert ? "0.8s" : "4s"}
                fill="freeze"
              />
            </feColorMatrix>
          </filter>
        </defs>

        {/* camera rig: wheel-zoom and drag-pan transform everything below, anchored at the office's visual center */}
        <g
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: `${CAMERA_ORIGIN.x}px ${CAMERA_ORIGIN.y}px`,
            transition: cameraSmooth ? "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
          onTransitionEnd={() => setCameraSmooth(false)}
        >
        <g filter="url(#officeDayNightGrade)">
        {/* structural diorama base: a broad soft shadow plus a solid concrete pedestal dropping
            below the floor, so the whole complex reads as an architectural cutaway model with
            real physical weight instead of a sheet floating in the void */}
        <MasterGroundShadow />
        <FoundationBlock />
        <PerimeterWalls
          minX={FLOOR.minX}
          minY={FLOOR.minY}
          maxX={FLOOR.maxX}
          maxY={FLOOR.maxY}
          height={WALL_HEIGHT}
          dimmed={dayPhase === "night"}
        />
        <ParquetFloor />

        {/* zone floor materials, conveying room identity through architecture instead of text */}
        <ServerRoomTiles originX={SERVER_ROOM_ORIGIN.x} originY={SERVER_ROOM_ORIGIN.y} width={SERVER_ROOM_SIZE.width} depth={SERVER_ROOM_SIZE.depth} />
        <HazardBorder originX={SERVER_ROOM_ORIGIN.x} originY={SERVER_ROOM_ORIGIN.y} width={SERVER_ROOM_SIZE.width} depth={SERVER_ROOM_SIZE.depth} />
        <BoardroomRug originX={BOARDROOM_RUG.originX} originY={BOARDROOM_RUG.originY} width={BOARDROOM_RUG.width} depth={BOARDROOM_RUG.depth} />
        <BreakroomTiles originX={BREAKROOM_ORIGIN.x} originY={BREAKROOM_ORIGIN.y} width={BREAKROOM_SIZE.width} depth={BREAKROOM_SIZE.depth} />
        <EntranceMat originX={RECEPTION_MAT.originX} originY={RECEPTION_MAT.originY} width={RECEPTION_MAT.width} depth={RECEPTION_MAT.depth} />

        {/* circulation guide lines through the two main hallways */}
        <WalkwayGuide axis="y" fixed={8.6} from={0.5} to={4.0} />
        <WalkwayGuide axis="x" fixed={8.4} from={0.5} to={13.5} />

        {/* divider between the server vault and the engineering bay, with a walk-through gap */}
        <GlassWall axis="y" fixed={9.2} from={0.4} to={4.2} doorFrom={1.7} doorTo={2.9} />

        {/* boardroom enclosure, open toward the central walkway via a doorway on its right wall */}
        <GlassWall axis="x" fixed={9.0} from={0.4} to={6.9} />
        <GlassWall axis="y" fixed={6.9} from={9.0} to={13.6} doorFrom={10.6} doorTo={11.3} />

        <CableTray networkHealth={computeNetworkHealth(services)} />

        {/* density props scattered along the open walkways and the reception lounge */}
        <OfficePlant x={9.0} y={5.0} />
        <WasteBin x={5.6} y={4.6} />
        <OfficePlant x={0.3} y={4.4} />
        <OfficePlant x={7.3} y={9.4} />
        <MeetingNook x={16.5} y={9.4} />
        <WallClock x={4.0} y={0.15} z={0.9} />

        {/* additional density filling the mid-floor gap between engineering and the breakroom/boardroom */}
        <OfficePlant x={2.0} y={6.5} />
        <OfficePlant x={12.5} y={6.0} />
        <WasteBin x={17.0} y={5.5} />
        <Sofa x={18.5} y={2.0} />
        <OfficePlant x={20.5} y={3.5} />
        <OfficePlant x={19.5} y={6.5} />
        <WanderingEmployee waypoints={CORRIDOR_PATROL_WAYPOINTS} shirtColor="#6366f1" hairColor="#2b1a12" dwellMs={5000} />

        {/* corporate entrance lobby filling the once-empty foreground corner */}
        <ReceptionLobby originX={RECEPTION_ORIGIN.x} originY={RECEPTION_ORIGIN.y} />

        <ServerRoom
          originX={SERVER_ROOM_ORIGIN.x}
          originY={SERVER_ROOM_ORIGIN.y}
          services={services}
          selectedServiceId={selectedServiceId}
          onSelect={handleServiceSelect}
          onHoverService={handleHover}
          onLeaveService={handleLeave}
        />
        {infrastructureNodes.map((node) => (
          <InfrastructureNodeSprite
            key={node.id}
            node={node}
            services={services}
            serverRoomOriginX={SERVER_ROOM_ORIGIN.x}
            serverRoomOriginY={SERVER_ROOM_ORIGIN.y}
          />
        ))}
        <EngineeringFloor
          originX={ENGINEERING_ORIGIN.x}
          originY={ENGINEERING_ORIGIN.y}
          services={services}
          selectedServiceId={selectedServiceId}
          onSelect={selectService}
          onHoverService={handleHover}
          onLeaveService={handleLeave}
        />
        <BoardRoom originX={BOARDROOM_ORIGIN.x} originY={BOARDROOM_ORIGIN.y} />
        <BreakRoom originX={BREAKROOM_ORIGIN.x} originY={BREAKROOM_ORIGIN.y} />

        {/* defcon red alert: a dark red vignette over the whole floor plus a rig of rotating
            emergency beacons sweeping the walls, replacing normal lighting during a live p1 */}
        {redAlert && (
          <>
            <RedAlertOverlay minX={FLOOR.minX} minY={FLOOR.minY} maxX={FLOOR.maxX} maxY={FLOOR.maxY} />
            <g style={{ pointerEvents: "none" }}>
              <EmergencyBeacon x={SERVER_ROOM_ORIGIN.x + 0.1} y={SERVER_ROOM_ORIGIN.y - 0.05} />
              <EmergencyBeacon x={ENGINEERING_ORIGIN.x + 2.5} y={ENGINEERING_ORIGIN.y + 1.0} />
              <EmergencyBeacon x={BOARDROOM_ORIGIN.x + 1.6} y={BOARDROOM_ORIGIN.y + 0.9} />
            </g>
          </>
        )}
        </g>
        </g>
      </svg>

      {hoveredService && <OfficeTooltip service={hoveredService} x={hover!.x} y={hover!.y} />}
      <NodeInspector />
      <ObjectiveHint />

      {/* coherent camera-control panel: centralizar-na-crise and build-mode share one tactical dock
          instead of two loose buttons floating over the scene */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 p-1 rounded-lg border border-slate-800/80 bg-slate-950/80 backdrop-blur-md shadow-lg">
        {redAlert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCenterOnCrisis();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rose-500/50 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs font-semibold shadow-[0_0_10px_rgba(244,63,94,0.2)] active:scale-95 transition-all"
          >
            <Crosshair className="w-3.5 h-3.5" />
            {t.office.centerOnCrisis}
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleBuildMode();
            handleCancelBuild();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold active:scale-95 transition-all ${
            buildModeActive
              ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
              : "bg-slate-900/80 hover:bg-slate-800 border-slate-700/60 text-slate-300"
          }`}
        >
          <Hammer className="w-3.5 h-3.5" />
          {t.buildMode.toggle}
        </button>
      </div>

      {buildModeActive && (
        <div onClick={(e) => e.stopPropagation()}>
          <BuildModeOverlay
            armedNodeType={armedNodeType}
            pendingTargetId={pendingTargetId}
            onArm={handleArmNode}
            onCancel={handleCancelBuild}
          />
        </div>
      )}
    </div>
  );
}

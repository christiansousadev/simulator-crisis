import { Crosshair, Hammer } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { TRANSLATIONS } from "../../i18n/translations";
import { isReducedMotionNow } from "../../hooks/useReducedMotion";
import { usePresenceFlag } from "../../hooks/usePresence";
import { useGameStore } from "../../store/useGameStore";
import { IncidentSeverity, InfrastructureNodeType } from "../../types/game";
import { selectDefconLevel } from "../../utils/defcon";
import { highestSeverity } from "../../utils/severity";
import ObjectiveHint from "../common/ObjectiveHint";
import ObjectiveTracker from "../common/ObjectiveTracker";
import BoardRoom from "./BoardRoom";
import BreakRoom from "./BreakRoom";
import BuildModeOverlay from "./BuildModeOverlay";
import CableTray, { computeNetworkHealth } from "./CableTray";
import { AmbientLightOverlay, EmissiveLayer, FloorPools } from "./AmbientLight";
import EngineeringFloor from "./EngineeringFloor";
import {
  BoardroomRug,
  BreakroomTiles,
  EntranceMat,
  FloorSignage,
  HazardBorder,
  LightGradients,
  ServerRoomTiles,
  WalkwayGuide,
} from "./FloorDecals";
import GlassWall from "./GlassWall";
import InfrastructureNodeSprite from "./InfrastructureNodeSprite";
import IsoBox from "./IsoBox";
import LightingDriver from "./LightingDriver";
import NodeInspector from "./NodeInspector";
import OfficeTooltip from "./OfficeTooltip";
import TacticalMiniMap from "../common/TacticalMiniMap";
import IncidentAlertStack from "../common/IncidentAlertStack";
import RackRadialMenu from "./RackRadialMenu";
import ServiceDependencyLines from "./ServiceDependencyLines";
import CascadeRipple from "./CascadeRipple";
import { MeetingNook, OfficePlant, Sofa, WallClock, WasteBin } from "./OfficeProps";
import PerimeterWalls from "./PerimeterWalls";
import ReceptionLobby from "./ReceptionLobby";
import ServerRoom, { rackGridPosition } from "./ServerRoom";
import SkyLayers from "./SkyLayers";
import SkylineBackdrop from "./SkylineBackdrop";
import WanderingEmployee from "./WanderingEmployee";
import { CameraController } from "./cameraController";
import { project } from "./isoMath";
import { clearOfficeHover, handleOfficeHover, handleOfficeLeave } from "./officeHover";
import {
  BOARDROOM_ORIGIN,
  BREAKROOM_ORIGIN,
  CAMERA_ORIGIN,
  ENGINEERING_ORIGIN,
  FLOOR,
  RECEPTION_MAT_ORIGIN,
  RECEPTION_MAT_SIZE,
  RECEPTION_ORIGIN,
  SERVER_ROOM_ORIGIN,
  SERVER_ROOM_SIZE,
  WALL_HEIGHT,
  pickCrisisServiceId,
} from "./sceneLayout";

// ambient patrol loop along the y~8.4 hallway between the engineering bay and the lounge / reception.
// (the old loop ran at y 6.2-6.7, straight through the seated desk row and its chairs)
const CORRIDOR_PATROL_WAYPOINTS = [
  { x: 10.6, y: 8.3, action: "walk" as const },
  { x: 14.0, y: 8.3, action: "walk" as const },
  { x: 18.0, y: 8.3, action: "walk" as const },
  { x: 14.0, y: 8.55, action: "walk" as const },
];

// mirrors app.engine.infrastructure.INFRASTRUCTURE_CATALOG's requires_producer flag
const REQUIRES_PRODUCER: Record<InfrastructureNodeType, boolean> = {
  redis_cache: false,
  kafka_queue: true,
  db_read_replica: false,
  nginx_lb: false,
};

const BOARDROOM_RUG = { originX: BOARDROOM_ORIGIN.x + 0.3, originY: BOARDROOM_ORIGIN.y + 0.4, width: 3.2, depth: 1.7 };
const BREAKROOM_TILES = { width: 3.6, depth: 2.2 };

const WOOD_COLOR = "#c9a066";

// PARQUET WOOD FLOOR: ONE FLAT SLAB PLUS PLANK SEAM LINES FOLLOWING THE ISO GRID
function ParquetFloor() {
  // one path for every seam instead of ~40 separate line elements
  let seams = "";
  for (let gx = Math.ceil(FLOOR.minX); gx <= FLOOR.maxX; gx++) {
    const a = project(gx, FLOOR.minY, 0.021);
    const b = project(gx, FLOOR.maxY, 0.021);
    seams += `M${a.x},${a.y}L${b.x},${b.y}`;
  }
  for (let gy = Math.ceil(FLOOR.minY); gy <= FLOOR.maxY; gy++) {
    const a = project(FLOOR.minX, gy, 0.021);
    const b = project(FLOOR.maxX, gy, 0.021);
    seams += `M${a.x},${a.y}L${b.x},${b.y}`;
  }
  return (
    <g>
      <IsoBox x={FLOOR.minX} y={FLOOR.minY} z={0} w={FLOOR.maxX - FLOOR.minX} d={FLOOR.maxY - FLOOR.minY} h={0.02} color={WOOD_COLOR} topFactor={1.05} rightFactor={0.85} leftFactor={0.65} />
      <path d={seams} stroke="rgba(120,90,50,0.16)" strokeWidth={0.5} fill="none" />
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
  let rightLines = "";
  for (let i = 1; i < FOUNDATION_DIVIDER_COUNT_X; i++) {
    const gx = FLOOR.minX + (width * i) / FOUNDATION_DIVIDER_COUNT_X;
    const top = project(gx, FLOOR.maxY, 0);
    const bottom = project(gx, FLOOR.maxY, -FOUNDATION_DEPTH);
    rightLines += `M${top.x},${top.y}L${bottom.x},${bottom.y}`;
  }
  let leftLines = "";
  for (let i = 1; i < FOUNDATION_DIVIDER_COUNT_Y; i++) {
    const gy = FLOOR.minY + (depth * i) / FOUNDATION_DIVIDER_COUNT_Y;
    const top = project(FLOOR.maxX, gy, 0);
    const bottom = project(FLOOR.maxX, gy, -FOUNDATION_DEPTH);
    leftLines += `M${top.x},${top.y}L${bottom.x},${bottom.y}`;
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
      <path d={rightLines} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} fill="none" />
      <path d={leftLines} stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} fill="none" />
    </g>
  );
}

// broad, soft contact shadow beneath the entire diorama, grounding it with real physical weight
function MasterGroundShadow() {
  const center = project((FLOOR.minX + FLOOR.maxX) / 2, (FLOOR.minY + FLOOR.maxY) / 2, -FOUNDATION_DEPTH - 0.01);
  return <ellipse cx={center.x} cy={center.y + 40} rx={560} ry={170} fill="url(#groundShadowGradient)" opacity={0.9} />;
}

// ---- static layers --------------------------------------------------------------------------
// Everything below renders once (no props, nothing subscribed) and is skipped by every parent
// re-render. The old single component rebuilt ~1000 polygons on every telemetry tick. Layer order
// matches the painter's order of the original scene.

const StaticFloor = memo(function StaticFloor() {
  return (
    <>
      {/* structural diorama base: a broad soft shadow plus a solid concrete pedestal dropping
          below the floor, so the whole complex reads as an architectural cutaway model */}
      <MasterGroundShadow />
      <FoundationBlock />
      <PerimeterWalls minX={FLOOR.minX} minY={FLOOR.minY} maxX={FLOOR.maxX} maxY={FLOOR.maxY} height={WALL_HEIGHT} />
      <ParquetFloor />

      {/* zone floor materials, conveying room identity through architecture instead of text */}
      <ServerRoomTiles originX={SERVER_ROOM_ORIGIN.x} originY={SERVER_ROOM_ORIGIN.y} width={SERVER_ROOM_SIZE.width} depth={SERVER_ROOM_SIZE.depth} />
      <HazardBorder originX={SERVER_ROOM_ORIGIN.x} originY={SERVER_ROOM_ORIGIN.y} width={SERVER_ROOM_SIZE.width} depth={SERVER_ROOM_SIZE.depth} />
      <BoardroomRug originX={BOARDROOM_RUG.originX} originY={BOARDROOM_RUG.originY} width={BOARDROOM_RUG.width} depth={BOARDROOM_RUG.depth} />
      <BreakroomTiles originX={BREAKROOM_ORIGIN.x} originY={BREAKROOM_ORIGIN.y} width={BREAKROOM_TILES.width} depth={BREAKROOM_TILES.depth} />
      <EntranceMat originX={RECEPTION_MAT_ORIGIN.x} originY={RECEPTION_MAT_ORIGIN.y} width={RECEPTION_MAT_SIZE.width} depth={RECEPTION_MAT_SIZE.depth} />
    </>
  );
});

const StaticDecor = memo(function StaticDecor() {
  const t = useTranslation();
  return (
    <>
      {/* 3D Architectural Zone Signage */}
      <FloorSignage x={0.8} y={3.8} text={t.officeCore.signDataCenter} color="#38bdf8" axis="x" />
      <FloorSignage x={10.2} y={0.3} text={t.officeCore.signWarRoom} color="#94a3b8" axis="x" />
      <FloorSignage x={0.8} y={9.3} text={t.officeCore.signBoardroom} color="#fbbf24" axis="x" />
      <FloorSignage x={8.6} y={9.3} text={t.officeCore.signBreakroom} color="#34d399" axis="x" />
      <FloorSignage x={17.2} y={11.0} text={t.officeCore.signReception} color="#94a3b8" axis="x" />

      {/* circulation guide lines through the two main hallways */}
      <WalkwayGuide axis="y" fixed={8.6} from={0.5} to={4.0} />
      <WalkwayGuide axis="x" fixed={8.4} from={0.5} to={13.5} />

      {/* divider between the server vault and the engineering bay, with a walk-through gap */}
      <GlassWall axis="y" fixed={9.2} from={0.4} to={4.2} doorFrom={1.7} doorTo={2.9} />

      {/* boardroom enclosure, open toward the central walkway via a doorway on its right wall */}
      <GlassWall axis="x" fixed={9.0} from={0.4} to={6.9} />
      <GlassWall axis="y" fixed={6.9} from={9.0} to={13.6} doorFrom={10.6} doorTo={11.3} />
    </>
  );
});

const StaticProps = memo(function StaticProps() {
  return (
    <>
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
    </>
  );
});

const StaticRooms = memo(function StaticRooms() {
  return (
    <>
      <BoardRoom originX={BOARDROOM_ORIGIN.x} originY={BOARDROOM_ORIGIN.y} />
      <BreakRoom originX={BREAKROOM_ORIGIN.x} originY={BREAKROOM_ORIGIN.y} />
    </>
  );
});

// ---- dynamic layers -------------------------------------------------------------------------

const NetworkLayer = memo(function NetworkLayer() {
  const services = useGameStore((s) => s.telemetry.services);
  return <CableTray networkHealth={computeNetworkHealth(services)} />;
});

interface RackLayerProps {
  onSelect: (serviceId: string) => void;
  onFocusService: (serviceId: string) => void;
}

// racks, desks and everything that tracks live service state. It owns the telemetry selectors so
// the camera shell above it never re-renders on a tick.
const RackLayer = memo(function RackLayer({ onSelect, onFocusService }: RackLayerProps) {
  const services = useGameStore((s) => s.telemetry.services);
  const infrastructureNodes = useGameStore((s) => s.telemetry.infrastructure_nodes);
  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);
  const focusedServiceId = useGameStore((s) => s.selectedIncident?.service_id ?? null);
  const investigatingServiceId = useGameStore(
    (s) => s.telemetry.active_incidents.find((i) => i.id === s.triageIncidentId)?.service_id ?? null
  );

  // highest-severity active incident per service, as a string signature so it only changes when
  // a severity actually changes (not on every tick of an unrelated incident field)
  const severitySignature = useGameStore((s) => {
    const parts: string[] = [];
    for (const service of s.telemetry.services) {
      const worst = highestSeverity(s.telemetry.active_incidents.filter((i) => i.service_id === service.id).map((i) => i.severity));
      if (worst) parts.push(`${service.id}:${worst}`);
    }
    return parts.join("|");
  });
  const serviceSeverities = useMemo(() => {
    const map = new Map<string, IncidentSeverity>();
    for (const part of severitySignature.split("|")) {
      if (!part) continue;
      const [id, sev] = part.split(":");
      map.set(id, sev as IncidentSeverity);
    }
    return map;
  }, [severitySignature]);

  const selectedService = useMemo(
    () => (selectedServiceId ? services.find((s) => s.id === selectedServiceId) ?? null : null),
    [selectedServiceId, services]
  );
  const selectedServicePos = useMemo(
    () => (selectedServiceId ? rackGridPosition(selectedServiceId, services, SERVER_ROOM_ORIGIN.x, SERVER_ROOM_ORIGIN.y) : null),
    [selectedServiceId, services]
  );
  const closeMenu = useCallback(() => selectService(null), [selectService]);
  const focusSelected = useCallback(() => {
    if (selectedServiceId) onFocusService(selectedServiceId);
  }, [onFocusService, selectedServiceId]);

  return (
    <>
      <ServiceDependencyLines
        services={services}
        originX={SERVER_ROOM_ORIGIN.x}
        originY={SERVER_ROOM_ORIGIN.y}
        purchasedUpgrades={purchasedUpgrades}
      />
      <CascadeRipple services={services} originX={SERVER_ROOM_ORIGIN.x} originY={SERVER_ROOM_ORIGIN.y} />
      <ServerRoom
        originX={SERVER_ROOM_ORIGIN.x}
        originY={SERVER_ROOM_ORIGIN.y}
        services={services}
        selectedServiceId={selectedServiceId}
        serviceSeverities={serviceSeverities}
        investigatingServiceId={investigatingServiceId}
        focusedServiceId={focusedServiceId}
        onSelect={onSelect}
        onHoverService={handleOfficeHover}
        onLeaveService={handleOfficeLeave}
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

      {/* Tactical Radial Action Menu over the selected server rack */}
      {selectedService && selectedServicePos && (
        <RackRadialMenu
          service={selectedService}
          gridX={selectedServicePos.x}
          gridY={selectedServicePos.y}
          onFocusRack={focusSelected}
          onClose={closeMenu}
        />
      )}
      <EngineeringFloor
        originX={ENGINEERING_ORIGIN.x}
        originY={ENGINEERING_ORIGIN.y}
        services={services}
        selectedServiceId={selectedServiceId}
        onSelect={selectService}
        onHoverService={handleOfficeHover}
        onLeaveService={handleOfficeLeave}
      />
    </>
  );
});

// the camera targets, in the user space the rig transforms
function rackWorldPoint(serviceId: string): { x: number; y: number } | null {
  const { services } = useGameStore.getState().telemetry;
  const pos = rackGridPosition(serviceId, services, SERVER_ROOM_ORIGIN.x, SERVER_ROOM_ORIGIN.y);
  return pos ? project(pos.x + 0.35, pos.y + 0.3, 0.5) : null;
}

const FOCUS_SCALE = 1.7;
const CRISIS_VAULT_SCALE = 1.5;

// FULL-BLEED 2.5D ISOMETRIC OFFICE FLOOR, THE MAIN GAME VIEW
export default function IsometricOffice() {
  const t = useTranslation();
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);
  const focusedServiceId = useGameStore((s) => s.selectedIncident?.service_id ?? null);
  const buildModeActive = useGameStore((s) => s.buildModeActive);
  const toggleBuildMode = useGameStore((s) => s.toggleBuildMode);
  const featureFreezeActive = useGameStore((s) => s.telemetry.feature_freeze_active);
  // primitives only: the shell must not re-render on a tick
  const crisisServiceId = useGameStore((s) => pickCrisisServiceId(s.telemetry.services, s.telemetry.active_incidents));
  const defconLevel = useGameStore(selectDefconLevel);
  const hasCrisis = crisisServiceId !== null || defconLevel <= 3;

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneHostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<SVGGElement>(null);
  const controllerRef = useRef<CameraController | null>(null);
  const skylineElRef = useRef<HTMLDivElement | null>(null);
  const preFocusCameraRef = useRef<ReturnType<CameraController["getTarget"]> | null>(null);

  const [armedNodeType, setArmedNodeType] = useState<InfrastructureNodeType | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  // camera controller: owns the camera state, the wheel / drag / keyboard input and the rAF glide
  useEffect(() => {
    const container = containerRef.current;
    const sceneHost = sceneHostRef.current;
    const rig = rigRef.current;
    if (!container || !sceneHost || !rig) return;
    const controller = new CameraController({
      container,
      sceneHost,
      rig,
      isReducedMotion: isReducedMotionNow,
      onDragStart: clearOfficeHover,
    });
    controller.attach();
    controller.setSkyline(skylineElRef.current);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const setSkylineEl = useCallback((el: HTMLDivElement | null) => {
    skylineElRef.current = el;
    controllerRef.current?.setSkyline(el);
  }, []);

  // pause every looping css/svg animation while the tab is hidden or the scene is off screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let hidden = document.hidden;
    let offscreen = false;
    const sync = () => container.classList.toggle("office-paused", hidden || offscreen);
    const onVisibility = () => {
      hidden = document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        offscreen = !entries[entries.length - 1].isIntersecting;
        sync();
      });
      observer.observe(container);
    }
    sync();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  // ---- camera commands ----

  // smooth-flies the camera onto a specifically selected service rack
  const handleFocusService = useCallback((serviceId: string) => {
    const target = rackWorldPoint(serviceId);
    if (target) controllerRef.current?.flyToWorld(target, FOCUS_SCALE);
  }, []);

  // flies to the worst failing rack (highest severity, then a down service over a degraded one),
  // falling back to the middle of the vault when nothing specific is failing
  const handleCenterOnCrisis = useCallback(() => {
    const { telemetry } = useGameStore.getState();
    const id = pickCrisisServiceId(telemetry.services, telemetry.active_incidents);
    const rack = id ? rackWorldPoint(id) : null;
    if (rack) {
      controllerRef.current?.flyToWorld(rack, FOCUS_SCALE);
      return;
    }
    const vault = project(SERVER_ROOM_ORIGIN.x + SERVER_ROOM_SIZE.width / 2, SERVER_ROOM_ORIGIN.y + SERVER_ROOM_SIZE.depth / 2, 0.5);
    controllerRef.current?.flyToWorld(vault, CRISIS_VAULT_SCALE);
  }, []);

  // pans to arbitrary world coordinates (the minimap), keeping the player's zoom
  const handlePanToWorld = useCallback((gx: number, gy: number, opts?: { snap?: boolean }) => {
    controllerRef.current?.panToWorld(project(gx, gy, 0.5), opts);
  }, []);

  const handleResetView = useCallback(() => controllerRef.current?.reset(), []);

  // remembers the framing the player had right before the incident detail modal auto-focused the
  // camera on a specific rack, so closing it can fly back to exactly where they were
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (focusedServiceId) {
      const target = rackWorldPoint(focusedServiceId);
      if (!target) return;
      if (!preFocusCameraRef.current) preFocusCameraRef.current = controller.getTarget();
      controller.flyToWorld(target, FOCUS_SCALE);
    } else if (preFocusCameraRef.current) {
      controller.flyTo(preFocusCameraRef.current);
      preFocusCameraRef.current = null;
    }
  }, [focusedServiceId]);

  // ---- build mode ----

  const handleArmNode = (nodeType: InfrastructureNodeType) => {
    setArmedNodeType(nodeType);
    setPendingTargetId(null);
  };
  const handleCancelBuild = () => {
    setArmedNodeType(null);
    setPendingTargetId(null);
  };

  // the select handler handed to every rack must keep a stable identity (so the memoized scene
  // never re-renders because of it), hence it reads the latest build state from a ref
  const buildRef = useRef({ buildModeActive, armedNodeType, pendingTargetId });
  buildRef.current = { buildModeActive, armedNodeType, pendingTargetId };
  const handleServiceSelect = useCallback(
    async (serviceId: string) => {
      const { buildModeActive: building, armedNodeType: armed, pendingTargetId: pending } = buildRef.current;
      const store = useGameStore.getState();
      if (!building || !armed) {
        store.selectService(serviceId);
        return;
      }
      const copy = TRANSLATIONS[store.language];
      const needsProducer = REQUIRES_PRODUCER[armed];
      if (needsProducer && !pending) {
        // first click picks the protected consumer, second click picks the decoupled producer
        setPendingTargetId(serviceId);
        return;
      }
      const targetId = needsProducer ? pending! : serviceId;
      const producerId = needsProducer ? serviceId : undefined;
      const shelfCount = store.telemetry.infrastructure_nodes.length;
      const gridX = SERVER_ROOM_ORIGIN.x + 0.5 + (shelfCount % 4) * 1.0;
      const gridY = SERVER_ROOM_ORIGIN.y + 3.3 + Math.floor(shelfCount / 4) * 0.6;
      try {
        await api.placeInfrastructureNode(armed, gridX, gridY, targetId, producerId);
        store.pushFloatingText(copy.buildMode.placed, "success");
      } catch (err) {
        store.pushFloatingText(err instanceof Error && err.message ? err.message : copy.buildMode.placementFailed, "danger");
      }
      setArmedNodeType(null);
      setPendingTargetId(null);
    },
    []
  );

  // clicking any empty patch of canvas dismisses the inspector drawer; racks and desks stop this
  // bubble themselves. A drag that just finished is swallowed by the camera controller before it
  // gets here.
  const handleCanvasClick = useCallback(() => selectService(null), [selectService]);

  const freezeBanner = usePresenceFlag(featureFreezeActive, 220);

  return (
    <div
      ref={containerRef}
      data-tour="office-canvas"
      className="relative flex-1 office-sky overflow-hidden"
      onClick={handleCanvasClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <LightingDriver />
      <SkyLayers />
      <SkylineBackdrop onElement={setSkylineEl} />
      {/* the idle drift lives on this wrapper (translate only), apart from the camera transform */}
      <div ref={sceneHostRef} className="absolute inset-0 z-10 office-drift">
        <svg viewBox="-406 -156 1006 640" className="relative z-10 w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="groundShadowGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(15,23,42,0.32)" />
              <stop offset="100%" stopColor="rgba(15,23,42,0)" />
            </radialGradient>
            <LightGradients />
          </defs>

          {/* camera rig: the controller writes its transform imperatively (wheel zoom toward the
              cursor, drag with inertia, keyboard, fly-to), so React never re-renders for it */}
          <g
            ref={rigRef}
            style={{
              transform: "translate(0px, 0px) scale(1)",
              transformOrigin: `${CAMERA_ORIGIN.x}px ${CAMERA_ORIGIN.y}px`,
            }}
          >
            <StaticFloor />
            <FloorPools />
            <StaticDecor />
            <NetworkLayer />
            <StaticProps />
            <RackLayer onSelect={handleServiceSelect} onFocusService={handleFocusService} />
            <StaticRooms />

            {/* day / night / DEFCON lighting: darkness over the floor and walls, then the emissive
                lights (monitors, rack LEDs, beacons) drawn on top so they cut through it */}
            <AmbientLightOverlay bounds={FLOOR} wallHeight={WALL_HEIGHT} />
            <EmissiveLayer />
          </g>
        </svg>
      </div>

      <OfficeTooltip />
      <NodeInspector onFocusService={handleFocusService} />
      <ObjectiveHint />
      <ObjectiveTracker />
      <TacticalMiniMap
        onCenterCrisis={handleCenterOnCrisis}
        onFocusService={handleFocusService}
        onPanToWorld={handlePanToWorld}
        onResetView={handleResetView}
      />
      <IncidentAlertStack onFocusService={handleFocusService} />

      {/* Feature Freeze prominent banner — more visible than the tiny topbar indicator */}
      {freezeBanner.mounted && (
        <div
          role="status"
          className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 py-1.5 bg-amber-950/90 border-b border-amber-500/50 backdrop-blur-sm pointer-events-none ${
            freezeBanner.closing ? "animate-backdrop-out" : "animate-slide-down-in"
          }`}
        >
          <span className="text-amber-400 text-xs font-black uppercase tracking-widest">⚠ {t.officeCore.featureFreezeTitle}</span>
          <span className="text-amber-500/70 text-[10px] font-mono">— {t.officeCore.featureFreezeDetail}</span>
        </div>
      )}

      {/* coherent camera-control panel: centralizar-na-crise, focar-rack and build-mode share one tactical dock */}
      <div
        data-camera-ignore
        title={t.officeCore.cameraHint}
        className="absolute top-3 left-3 z-30 flex items-center gap-1.5 p-1 rounded-lg border border-slate-800/80 bg-slate-950/80 backdrop-blur-md shadow-lg"
      >
        {selectedServiceId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFocusService(selectedServiceId);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-sky-500/50 bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 text-xs font-semibold shadow-[0_0_10px_rgba(56,189,248,0.2)] active:scale-95 transition-all"
            title={t.office.focusService}
          >
            <Crosshair className="w-3.5 h-3.5" />
            {t.office.focusService}
          </button>
        )}

        {hasCrisis && (
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
        <div data-camera-ignore onClick={(e) => e.stopPropagation()}>
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

import { useEffect, useRef } from "react";
import { TRANSLATIONS } from "../i18n/translations";
import { WS_URL } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { DilemmaOffer, TelemetryState } from "../types/game";

const RECONNECT_DELAY_MS = 2000;

interface PreAlertWarningFrame {
  type: "PRE_ALERT_WARNING";
  service_id: string;
  ticks_remaining: number;
}

interface DilemmaOfferedFrame {
  type: "DILEMMA_OFFERED";
  dilemma_id: string;
  title: string;
  narrative: string;
  choices: DilemmaOffer["choices"];
  expires_at_tick: number;
}

interface AchievementUnlockedFrame {
  type: "ACHIEVEMENT_UNLOCKED";
  achievement_id: string;
  name: string;
  prestige_points: number;
}

type SocketFrame = TelemetryState | PreAlertWarningFrame | DilemmaOfferedFrame | AchievementUnlockedFrame;

// owns the websocket lifecycle and streams tick broadcasts into the game store
export function useSimulationSocket() {
  const setTelemetry = useGameStore((s) => s.setTelemetry);
  const setConnected = useGameStore((s) => s.setConnected);
  const setActiveDilemma = useGameStore((s) => s.setActiveDilemma);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const setAchievementToast = useGameStore((s) => s.setAchievementToast);
  const language = useGameStore((s) => s.language);
  // read inside the socket handler via a ref, not as an effect dependency below -- language is
  // only used to localize one floating-text string, but including it in the effect's deps tore
  // the whole websocket connection down and reconnected it (with RECONNECT_DELAY_MS's 2s gap,
  // and a flip to "RECONNECTING" in the topbar) on every language change, just to pick a string
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        // mark telemetry transport active
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SocketFrame;
          if (data.type === "TICK_BROADCAST") {
            setTelemetry(data);
          } else if (data.type === "DILEMMA_OFFERED") {
            setActiveDilemma({
              dilemma_id: data.dilemma_id,
              title: data.title,
              narrative: data.narrative,
              choices: data.choices,
              expires_at_tick: data.expires_at_tick,
            });
          } else if (data.type === "PRE_ALERT_WARNING") {
            const text = TRANSLATIONS[languageRef.current].floatingTexts.preAlertWarning(data.service_id, data.ticks_remaining);
            pushFloatingText(text, "warning");
          } else if (data.type === "ACHIEVEMENT_UNLOCKED") {
            setAchievementToast({ achievementId: data.achievement_id, name: data.name, prestigePoints: data.prestige_points });
          }
          // unrecognized frame types are ignored so this handler stays forward-compatible
        } catch {
          // ignore malformed frame
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          // schedule reconnection attempt
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [setTelemetry, setConnected, setActiveDilemma, pushFloatingText, setAchievementToast]);
}

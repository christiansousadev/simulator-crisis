import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LiveOpsView from "./components/live-ops/LiveOpsView";
import { loadLanguage } from "./i18n/loadLanguage";
import { loadStoredLanguage } from "./i18n/language";
import { useGameStore } from "./store/useGameStore";
import "./index.css";

// no routing library is used: a single dependency-free path branch picks the
// spectator dashboard for /live-ops, and the normal game everywhere else
const RootComponent = window.location.pathname === "/live-ops" ? LiveOpsView : App;

// non-english dictionaries are lazy chunks: fetch the stored language's before the first render so
// no component ever sees a missing dictionary (index.html paints a splash meanwhile); if the fetch
// fails (offline, cold cache) fall back to the bundled english instead of blocking the app
async function boot() {
  try {
    await loadLanguage(loadStoredLanguage());
  } catch {
    useGameStore.setState({ language: "en" });
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>
  );
}

void boot();

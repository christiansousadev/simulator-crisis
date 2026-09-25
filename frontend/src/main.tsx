import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LiveOpsView from "./components/live-ops/LiveOpsView";
import "./index.css";

// no routing library is used: a single dependency-free path branch picks the
// spectator dashboard for /live-ops, and the normal game everywhere else
const RootComponent = window.location.pathname === "/live-ops" ? LiveOpsView : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);

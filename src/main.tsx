import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "./state/session";
import "./styles.css";

// HashRouter: the app is a static bundle behind an auth-gated host (ADR §4);
// hash routes need no server rewrite rules on any of the candidate hosts.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </HashRouter>
  </React.StrictMode>,
);

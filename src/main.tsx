import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "./state/session";
import { captureAuthCallbackError } from "./lib/authCallback";
import "./styles.css";

// Before HashRouter mounts: a failed sign-in redirect leaves `#error=...` on the URL,
// which the router would read as a route path (matching nothing, rendering blank) and
// which nothing in the app used to surface to the person it happened to.
captureAuthCallbackError();

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

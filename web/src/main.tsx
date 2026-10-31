import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/stix-two-text/400.css";
import "@fontsource/stix-two-text/400-italic.css";
import "@fontsource/stix-two-text/500.css";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/family.css";
import "./app/app.css";
import "./paper/reading.css";

import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Day and night, adapted from Lean Exposition. A stored choice is kept only when it
// differs from the system's, so choosing the system's own scheme follows it again.
// index.html reads the same key before the first paint.

import { useSyncExternalStore } from "react";

export type Scheme = "light" | "dark";
const KEY = "proof-reader-theme";

export function systemScheme(): Scheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentScheme(): Scheme {
  const forced = document.documentElement.getAttribute("data-theme");
  return forced === "light" || forced === "dark" ? forced : systemScheme();
}

export function setScheme(next: Scheme): void {
  const root = document.documentElement;
  root.classList.add("no-transitions");
  if (next === systemScheme()) {
    root.removeAttribute("data-theme");
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  } else {
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }
  document.dispatchEvent(new CustomEvent("proof-reader:scheme"));
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("no-transitions")));
}

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  document.addEventListener("proof-reader:scheme", listener);
  media.addEventListener("change", listener);
  return () => {
    document.removeEventListener("proof-reader:scheme", listener);
    media.removeEventListener("change", listener);
  };
}

export const useScheme = () => useSyncExternalStore(subscribe, currentScheme, () => "light" as Scheme);

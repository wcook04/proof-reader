// The map's remembered scene, kept per history entry so Back returns the reader
// to the camera, unfolded branches and representation they left. The URL holds
// what is selected; the history entry's state holds how it was being looked at.
//
// Pan and zoom only ever replace the current entry's state (never push), and
// other owners' keys in history.state (the reader keeps its own) are merged,
// never overwritten.

import type { MapScene } from "./ArgumentTree";

export type { MapScene };

const KEY = "mapScene";
const DELAY = 200;

function stateObject(): Record<string, unknown> {
  const s = window.history.state as unknown;
  return s && typeof s === "object" ? { ...(s as Record<string, unknown>) } : {};
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A scene as stored, if it is well formed and every record it names is in this edition. */
export function validScene(value: unknown, has: (id: string) => boolean): MapScene | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<MapScene>;
  const c = v.camera;
  if (!c || !finite(c.x) || !finite(c.y) || !finite(c.k) || c.k <= 0) return null;
  if (!Array.isArray(v.expanded) || !v.expanded.every((id) => typeof id === "string" && has(id))) return null;
  if (v.mode !== "steps" && v.mode !== "overview") return null;
  const a = v.anchor;
  const anchor = a && typeof a.id === "string" && has(a.id) && finite(a.x) && finite(a.y) ? { id: a.id, x: a.x, y: a.y } : undefined;
  return { camera: { x: c.x, y: c.y, k: c.k }, expanded: [...v.expanded], mode: v.mode, ...(anchor ? { anchor } : {}) };
}

/** The scene remembered for the current history entry, or null. */
export function readScene(has: (id: string) => boolean): MapScene | null {
  return validScene(stateObject()[KEY], has);
}

function write(scene: MapScene, href: string) {
  // The entry may have changed since the scene settled; never write into another page's entry.
  if (window.location.href !== href) return;
  try {
    window.history.replaceState({ ...stateObject(), [KEY]: scene }, "");
  } catch {
    /* history state unavailable (sandboxed frames) */
  }
}

/** Debounced writes of the settled scene into the current entry. */
export function sceneWriter() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { scene: MapScene; href: string } | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return {
    /** Remember this scene for the current entry after a short quiet period. */
    save(scene: MapScene) {
      if (timer) clearTimeout(timer);
      pending = { scene, href: window.location.href };
      timer = setTimeout(() => {
        const p = pending;
        cancel();
        if (p) write(p.scene, p.href);
      }, DELAY);
    },
    /** Write now (before leaving the entry), preferring a fresh scene when one is given. */
    flush(scene?: MapScene | null) {
      const p = pending;
      cancel();
      if (scene) write(scene, window.location.href);
      else if (p) write(p.scene, p.href);
    },
    cancel,
  };
}

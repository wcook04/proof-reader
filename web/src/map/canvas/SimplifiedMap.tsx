// "Simplified map · N relations not drawn": the map leaves out a recorded
// support when a longer chain of recorded support already joins the same two
// records. This control says so and lists each relation it left out, grouped
// by type, so any of them can be opened as a step.

import { useEffect, useId, useRef, useState } from "react";
import type { ArgEdge, ArgGraph } from "../../model/graph";
import { relationName } from "../labels";

const ORDER = ["supports", "assumes", "formalizes"] as const;

export function SimplifiedMap({ graph, hidden, onChoose }: { graph: ArgGraph; hidden: readonly ArgEdge[]; onChoose(key: string): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    // Capture phase, so the page's own Escape (which clears the selection) waits.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!hidden.length) return null;
  const label = (nodeId: string) => graph.nodes.get(nodeId)?.label ?? nodeId;
  const n = hidden.length;
  return (
    <div className="sim" ref={root} onPointerDown={(event) => event.stopPropagation()}>
      <button ref={button} type="button" className="sim__button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="rel-sample rel-sample--formalizes sim__sample" aria-hidden="true" />
        {n} recorded {n === 1 ? "link is" : "links are"} not drawn
      </button>
      {open && (
        <div id={id} className="sim__pop" role="dialog" aria-label="Recorded links not drawn on the map">
          <p className="sim__note">
            A line of recorded support between two records is left out when a longer chain of recorded support already joins
            them. Explicit assumptions and recorded Lean correspondences are always drawn.
          </p>
          {ORDER.map((kind) => {
            const rows = hidden.filter((e) => e.kind === kind);
            if (!rows.length) return null;
            return (
              <section key={kind} className="sim__group">
                <h3 className="sim__head">
                  <span className={`rel-sample rel-sample--${kind}`} aria-hidden="true" />
                  {relationName(kind)} ({rows.length})
                </h3>
                <ul className="sim__list">
                  {rows.map((e) => (
                    <li key={e.key}>
                      <button
                        type="button"
                        className="sim__row"
                        onClick={() => {
                          setOpen(false);
                          onChoose(e.key);
                        }}
                      >
                        <span className="sim__from">{label(e.from)}</span>
                        <span className="sim__verb">{kind === "assumes" ? "assumes" : kind === "formalizes" ? "corresponds in Lean to" : "uses"}</span>
                        <span className="sim__to">{label(e.to)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

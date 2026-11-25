// The thread crosses the gutter from the sentence being read to its Lean row
// or graph card. It updates when either pane moves or the endpoints change,
// then eases into place and stops drawing.

import { useEffect, useRef, type RefObject } from "react";

const EASE = 0.26;
const SNAP = 0.1;

interface Point {
  x: number;
  y: number;
}

interface Target {
  passage: string | null;
  line: number | null;
}

function curve(a: Point, b: Point): string {
  const pull = Math.max(10, Math.abs(b.x - a.x) * 0.5);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${(a.x + pull).toFixed(1)} ${a.y.toFixed(1)} ${(b.x - pull).toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function glide(was: Point | null, to: Point, reduced: boolean): Point {
  if (!was || reduced || Math.hypot(to.x - was.x, to.y - was.y) <= SNAP) return to;
  return { x: was.x + (to.x - was.x) * EASE, y: was.y + (to.y - was.y) * EASE };
}

export function Threads({ root, target }: { root: RefObject<HTMLElement | null>; target: Target }) {
  const svg = useRef<SVGSVGElement>(null);
  const latest = useRef(target);
  latest.current = target;
  const wake = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = root.current;
    const lines = svg.current;
    if (!el || !lines) return;
    const container = el;
    const path = lines.querySelector("path")!;
    const [firstDot, lastDot] = lines.querySelectorAll("circle");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let start: Point | null = null;
    let end: Point | null = null;
    let frame = 0;

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const sizes = new ResizeObserver(schedule);
    const structure = new MutationObserver(schedule);
    const positions = new MutationObserver(schedule);
    let watched: (Element | null | undefined)[] = [];

    function dot(circle: SVGCircleElement, point: Point) {
      circle.setAttribute("cx", point.x.toFixed(1));
      circle.setAttribute("cy", point.y.toFixed(1));
    }

    function draw() {
      frame = 0;
      const { passage, line } = latest.current;
      const paper = container.querySelector<HTMLElement>("[data-paper-pane]");
      const tie = passage && paper ? paper.querySelector<HTMLElement>(`.tie[data-passage="${CSS.escape(passage)}"]`) : null;
      const proof = container.querySelector<HTMLElement>(".proof");
      const leanBody = proof?.querySelector<HTMLElement>(".proof__lean:not([hidden]) .leaf__body");
      const row = line && leanBody ? leanBody.querySelector<HTMLElement>(`.source__line[data-line="${line}"]:not(.cmp__code *)`) : null;
      const canvas = proof?.querySelector<HTMLElement>(".proof__graph:not([hidden]) .fg__scroll");
      const world = canvas?.querySelector<HTMLElement>(".fg__world");
      const within = row && leanBody ? leanBody : canvas;
      const mark = row ?? world?.querySelector<HTMLElement>(".fg__card.is-subject");
      const next = [paper, paper?.querySelector(".sheet"), tie, proof, within, world, mark];
      if (next.some((node, i) => node !== watched[i])) {
        watched = next;
        sizes.disconnect();
        sizes.observe(container);
        for (const node of next) if (node) sizes.observe(node);
        positions.disconnect();
        // The tie can be repositioned when the paper lays out. Camera gestures
        // transform the graph world without changing the observed box sizes.
        for (const node of [tie, world]) if (node) positions.observe(node, { attributes: true, attributeFilter: ["style"] });
      }

      const t = tie?.getBoundingClientRect();
      const pane = paper?.getBoundingClientRect();
      if (!t || !pane || t.height <= 0 || t.bottom <= pane.top || t.top >= pane.bottom || !proof || !mark || !within) {
        if (start) for (const shape of [path, firstDot, lastDot]) shape.style.opacity = "";
        start = end = null;
        return;
      }

      const box = container.getBoundingClientRect();
      const r = mark.getBoundingClientRect();
      const s = within.getBoundingClientRect();
      const startAt = {
        x: pane.right - box.left,
        y: Math.max(pane.top + 6, Math.min(pane.bottom - 6, t.top + t.height / 2)) - box.top,
      };
      const endAt = {
        x: proof.getBoundingClientRect().left - box.left,
        y: Math.max(s.top + 8, Math.min(s.bottom - 8, r.top + Math.min(11, r.height / 2))) - box.top,
      };
      const from = glide(start, startAt, reduced.matches);
      const to = glide(end, endAt, reduced.matches);
      if (from.x !== start?.x || from.y !== start?.y || to.x !== end?.x || to.y !== end?.y) {
        path.setAttribute("d", curve(from, to));
        dot(firstDot, from);
        dot(lastDot, to);
      }
      if (!start) for (const shape of [path, firstDot, lastDot]) shape.style.opacity = "1";
      start = from;
      end = to;
      if (from !== startAt || to !== endAt) schedule();
    }

    wake.current = schedule;
    // A new pane or subject may be mounted after the target changes.
    structure.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "data-paper-pane", "data-card"] });
    el.addEventListener("scroll", schedule, { capture: true, passive: true });
    el.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    reduced.addEventListener("change", schedule);
    schedule();
    return () => {
      wake.current = null;
      cancelAnimationFrame(frame);
      sizes.disconnect();
      structure.disconnect();
      positions.disconnect();
      el.removeEventListener("scroll", schedule, true);
      el.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, [root]);

  const { passage, line } = target;
  useEffect(() => wake.current?.(), [passage, line]);

  return (
    <svg ref={svg} className="threads" aria-hidden="true">
      <path />
      <circle r="2.75" />
      <circle r="2.75" />
    </svg>
  );
}

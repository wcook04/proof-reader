// The thread: a short line across the gutter from the sentence being read to the
// right page, level with the Lean it describes or, with the Lean closed, the card
// lit for it. It stops at the page's edge and only ever crosses the empty gutter, so
// it can never run over a card or text. It is drawn from what is on screen each
// frame, so it stays tied while pages move.

import { useEffect, useRef, type RefObject } from "react";

const EASE = 0.26;

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

export function Threads({ root, target }: { root: RefObject<HTMLElement | null>; target: Target }) {
  const svg = useRef<SVGSVGElement>(null);
  const latest = useRef(target);
  latest.current = target;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const held = new Map<string, Point>();
    const glide = (key: string, to: Point): Point => {
      const was = held.get(key);
      const next = !was || reduced.matches ? to : { x: was.x + (to.x - was.x) * EASE, y: was.y + (to.y - was.y) * EASE };
      held.set(key, next);
      return next;
    };
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = root.current;
      const lines = svg.current;
      if (!el || !lines) return;
      const box = el.getBoundingClientRect();
      const paths = lines.querySelectorAll("path");
      const dots = lines.querySelectorAll("circle");
      const { passage, line } = latest.current;
      const sheetEdge = el.querySelector<HTMLElement>(".sheet");
      const paper = el.querySelector<HTMLElement>("[data-paper-pane]");
      const tie = passage ? el.querySelector<HTMLElement>(`.tie[data-passage="${CSS.escape(passage)}"]`) : null;
      let used = 0;
      let dotted = 0;
      const dot = (p: Point) => {
        const c = dots[dotted++];
        if (!c) return;
        c.setAttribute("cx", p.x.toFixed(1));
        c.setAttribute("cy", p.y.toFixed(1));
        c.style.opacity = "1";
      };
      const stroke = (a: Point, b: Point) => {
        const p = paths[used++];
        if (!p) return;
        p.setAttribute("d", curve(a, b));
        p.style.opacity = "1";
      };
      if (tie && paper) {
        const t = tie.getBoundingClientRect();
        const pane = paper.getBoundingClientRect();
        const start = glide("start", {
          x: (sheetEdge ? sheetEdge.getBoundingClientRect().right : t.right) - box.left,
          y: Math.max(pane.top + 6, Math.min(pane.bottom - 6, t.top + t.height / 2)) - box.top,
        });
        const page = el.querySelector<HTMLElement>(".proof");
        const leanBody = el.querySelector<HTMLElement>(".proof__lean:not([hidden]) .leaf__body");
        const row = line && leanBody ? leanBody.querySelector<HTMLElement>(`.source__line[data-line="${line}"]`) : null;
        const canvas = el.querySelector<HTMLElement>(".proof__graph:not([hidden]) .graph__canvas");
        const card = canvas?.querySelector<HTMLElement>('.card[data-trail="here"]') ?? null;
        const within = row && leanBody ? leanBody : canvas;
        const mark = row ?? card;
        if (page && mark && within) {
          const r = mark.getBoundingClientRect();
          const s = within.getBoundingClientRect();
          const end = glide("end", { x: page.getBoundingClientRect().left - box.left, y: Math.max(s.top + 8, Math.min(s.bottom - 8, r.top + Math.min(11, r.height / 2))) - box.top });
          dot(start);
          stroke(start, end);
          dot(end);
        }
      }
      for (let i = used; i < paths.length; i++) paths[i].style.opacity = "0";
      for (let i = dotted; i < dots.length; i++) dots[i].style.opacity = "0";
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [root]);

  return (
    <svg ref={svg} className="threads" aria-hidden="true">
      <path />
      <circle r="2.75" />
      <circle r="2.75" />
    </svg>
  );
}

// The paper set as a page to read. The words come from paper.md, which the build
// has compared with the PDF word for word, and the HTML arrives finished: the
// browser only attends to it. A citation or a figure opens under the paragraph
// that mentions it, so the reader never loses their place, and scrolling reports
// the sentence at the reading line.

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Passage } from "../app/edition";
import { READING_LINE, type PaperHandle } from "./reading-line";

interface Props {
  html: string;
  passages: Passage[];
  active: string | null;
  lit: ReadonlySet<string>;
  /** Where the reader opens: a passage, or a place such as `fig-2`. */
  start: string | null;
  place: string | null;
  onActive(id: string | null): void;
  onSection(id: string | null): void;
  onPick(id: string): void;
  onName(name: string): void;
  onPage(page: number): void;
  onJump(from: string | null): void;
  onUserScroll(): void;
  /** Shown at the end of the paper where the page has no room for it. */
  foot?: ReactNode;
}

interface Bar {
  id: string;
  top: number;
  height: number;
}

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Set once. Everything that changes afterwards is a class on what is already there. */
const Sheet = memo(function Sheet({ html }: { html: string }) {
  return <article className="sheet__text" dangerouslySetInnerHTML={{ __html: html }} />;
});

export const ReadingPane = forwardRef<PaperHandle, Props>(function ReadingPane(props, ref) {
  const { html, passages, active, lit, start, place, onActive, onSection, onPick, onName, onPage, onJump, onUserScroll, foot } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const marks = useRef(new Map<string, HTMLElement[]>());
  const tops = useRef(new Map<string, number>());
  const headings = useRef<{ id: string; top: number }[]>([]);
  const programmatic = useRef(0);
  const arrive = useRef(0);
  const placed = useRef(false);
  const left = useRef<number | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const measure = useCallback(() => {
    const el = scroller.current;
    const page = sheet.current;
    if (!el || !page) return;
    const origin = el.getBoundingClientRect().top - el.scrollTop;
    const sheetTop = page.getBoundingClientRect().top;
    const next: Bar[] = [];
    tops.current.clear();
    for (const [id, parts] of marks.current) {
      const boxes = parts.map((part) => part.getBoundingClientRect());
      const top = Math.min(...boxes.map((b) => b.top));
      const bottom = Math.max(...boxes.map((b) => b.bottom));
      tops.current.set(id, top - origin);
      next.push({ id, top: top - sheetTop, height: bottom - top });
    }
    headings.current = [...page.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map((h) => ({ id: h.id, top: h.getBoundingClientRect().top - origin }));
    setBars(next);
  }, []);

  const scrollTo = useCallback((top: number, instant = false) => {
    const el = scroller.current;
    if (!el) return;
    programmatic.current = Date.now() + 900;
    el.scrollTo({ top, behavior: prefersReduced() || instant ? "auto" : "smooth" });
    // A background tab may never run the animation, so arrive regardless.
    window.clearTimeout(arrive.current);
    arrive.current = window.setTimeout(() => {
      if (Math.abs(el.scrollTop - top) > 40) el.scrollTo({ top, behavior: "auto" });
    }, 950);
  }, []);

  const toPassage = useCallback(
    (id: string, instant = false) => {
      const top = tops.current.get(id);
      const el = scroller.current;
      if (top !== undefined && el) scrollTo(top - el.clientHeight * READING_LINE, instant);
    },
    [scrollTo],
  );

  const toPlace = useCallback(
    (id: string, instant = false) => {
      const el = scroller.current;
      const target = el?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
      if (!el || !target) return;
      const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      scrollTo(top - 24, instant);
    },
    [scrollTo],
  );

  const whereNow = useCallback(() => {
    const el = scroller.current;
    if (!el) return null;
    const line = el.scrollTop + el.clientHeight * READING_LINE;
    let current: string | null = null;
    for (const h of headings.current) if (h.top <= line) current = h.id;
    return current;
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToPassage: toPassage,
    scrollToPlace: toPlace,
    toTop: () => scrollTo(0),
    back: () => {
      if (left.current !== null) scrollTo(left.current);
      left.current = null;
    },
  }), [scrollTo, toPassage, toPlace]);

  // Index the marks once, then keep their positions as the layout changes.
  useLayoutEffect(() => {
    const page = sheet.current;
    if (!page) return;
    const found = new Map<string, HTMLElement[]>();
    page.querySelectorAll<HTMLElement>(".q").forEach((el) => {
      for (const id of (el.dataset.p ?? "").split(" ")) found.set(id, [...(found.get(id) ?? []), el]);
    });
    marks.current = found;
    measure();
    if (!placed.current) {
      placed.current = true;
      if (place) toPlace(place, true);
      else if (start) toPassage(start, true);
    }
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      measure();
      if (place) toPlace(place, true);
      else if (start) toPassage(start, true);
    });
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [html, measure, place, start, toPassage, toPlace]);

  // Follow a new address after the page is open.
  useEffect(() => {
    if (place) toPlace(place);
  }, [place, toPlace]);

  useEffect(() => {
    const page = sheet.current;
    if (!page) return;
    page.querySelectorAll<HTMLElement>(".q.is-active, .q.is-lit, .q.is-hover").forEach((el) => el.classList.remove("is-active", "is-lit", "is-hover"));
    for (const id of lit) marks.current.get(id)?.forEach((el) => el.classList.add("is-lit"));
    if (hover) marks.current.get(hover)?.forEach((el) => el.classList.add("is-hover"));
    if (active) marks.current.get(active)?.forEach((el) => el.classList.add("is-active"));
  }, [active, hover, lit]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      onSection(whereNow());
      if (Date.now() < programmatic.current) return;
      const line = el.scrollTop + el.clientHeight * READING_LINE;
      let best: string | null = null;
      let bestGap = el.clientHeight * 0.5;
      for (const passage of passages) {
        const top = tops.current.get(passage.id);
        if (top === undefined) continue;
        const gap = Math.abs(top - line);
        if (gap < bestGap) {
          best = passage.id;
          bestGap = gap;
        }
      }
      onActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onSection(whereNow());
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [bars.length, onActive, onSection, passages, whereNow]);

  /** Open a copy of a reference or a figure under the block that mentions it. */
  const toggleInset = useCallback(
    (id: string, link: HTMLElement) => {
      const block = link.closest<HTMLElement>("p, li, figcaption, aside");
      const page = sheet.current;
      const source = page?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
      if (!block || !page || !source) return;
      const open = block.parentElement?.querySelector<HTMLElement>(`:scope > .inset[data-for="${CSS.escape(id)}"]`);
      if (open) {
        open.remove();
        link.removeAttribute("aria-expanded");
        return;
      }
      const inset = document.createElement("div");
      inset.className = `inset inset--${id.startsWith("fig-") ? "figure" : "cite"}`;
      inset.dataset.for = id;
      const copy = source.cloneNode(true) as HTMLElement;
      copy.removeAttribute("id");
      copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      copy.querySelectorAll(".is-active, .is-lit").forEach((el) => el.classList.remove("is-active", "is-lit"));
      copy.querySelectorAll(".pg").forEach((el) => el.remove());
      const close = document.createElement("button");
      close.type = "button";
      close.className = "inset__close";
      close.textContent = "Close";
      close.setAttribute("aria-label", "Close this");
      inset.append(copy, close);
      block.after(inset);
      link.setAttribute("aria-expanded", "true");
    },
    [],
  );

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const close = target.closest<HTMLElement>(".inset__close");
    if (close) {
      const inset = close.closest<HTMLElement>(".inset");
      const id = inset?.dataset.for;
      if (inset) inset.remove();
      if (id) sheet.current?.querySelectorAll(`[aria-expanded][href$="@${CSS.escape(id)}"]`).forEach((el) => el.removeAttribute("aria-expanded"));
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a");
    if (link) {
      if (link.classList.contains("nm")) {
        event.preventDefault();
        // A line of code tied to the Lean goes to its exact lines, not to the first name on it.
        const line = link.closest<HTMLElement>("pre .q");
        if (line?.dataset.p) onPick(line.dataset.p.split(" ")[0]);
        else onName(link.dataset.name ?? "");
        return;
      }
      if (link.classList.contains("pg")) {
        event.preventDefault();
        onPage(Number(link.dataset.page));
        return;
      }
      const goal = /@(.+)$/.exec(link.getAttribute("href") ?? "")?.[1];
      if (!goal) return;
      event.preventDefault();
      if (goal.startsWith("cite-") || goal.startsWith("fig-")) toggleInset(goal, link);
      else {
        left.current = scroller.current?.scrollTop ?? null;
        onJump(whereNow());
        toPlace(goal);
      }
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const mark = target.closest<HTMLElement>(".q");
    if (mark?.dataset.p) onPick(mark.dataset.p.split(" ")[0]);
  };

  const onOver = (event: React.MouseEvent<HTMLDivElement>) => {
    const mark = (event.target as HTMLElement).closest<HTMLElement>(".q");
    setHover(mark?.dataset.p?.split(" ")[0] ?? null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) onUserScroll();
    if (event.key === "Escape") sheet.current?.querySelectorAll(".inset").forEach((el) => el.remove());
  };

  return (
    <div className="reading" data-paper-pane ref={scroller} tabIndex={0} aria-label="The paper" onWheel={onUserScroll} onTouchMove={onUserScroll} onKeyDown={onKeyDown}>
      <div className="sheet" ref={sheet} onClick={onClick} onMouseOver={onOver} onMouseLeave={() => setHover(null)}>
        <Sheet html={html} />
        <div className="sheet__ties" aria-hidden="true">
          {bars.map((bar) => (
            <span
              key={bar.id}
              data-passage={bar.id}
              className={`tie${bar.id === active ? " is-active" : ""}${lit.has(bar.id) ? " is-lit" : ""}${bar.id === hover ? " is-hover" : ""}`}
              style={{ top: bar.top, height: bar.height }}
            />
          ))}
        </div>
      </div>
      {foot}
    </div>
  );
});

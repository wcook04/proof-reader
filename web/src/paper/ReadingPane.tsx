// The paper set as a page to read. The words come from paper.md, which the build
// has compared with the PDF word for word, and the HTML arrives finished: the
// browser only attends to it.
//
// The reading line picks the statement under it at once, on this page, by writing
// classes straight onto what is there, so scrolling never waits for React. Only
// when a statement has held the line does the right page hear about it.

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Pin } from "../app/history";
import type { Passage } from "../app/edition";
import { DWELL_MS, FOLLOW_MS, READING_LINE, type PaperHandle, type Pointed, type Target, type Where, type Zone } from "./reading-line";

interface Props {
  html: string;
  passages: Passage[];
  hidden: boolean;
  pin: Pin | null;
  /** Statements lit because something tied to them is held or pointed at. */
  lit: ReadonlySet<string>;
  /** A statement has held the reading line, or none has. */
  onFollow(id: string | null, zone: Zone): void;
  onSection(id: string | null): void;
  /** The paper has stopped moving. */
  onSettle(): void;
  onPin(id: string): void;
  onName(name: string): void;
  onPage(page: number): void;
  /** A reference to somewhere else in the paper. */
  onJump(place: string): void;
  onPoint(pointed: Pointed): void;
  /** The held statement has left the view. */
  onPinLeft(): void;
  onReady(): void;
  /** Above the sheet: what to do on this page. */
  hint?: ReactNode;
  /** Below the sheet: whose words these are. */
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

/** The place a link in the paper names, as `@place` in its address. */
const goalOf = (link: Element | null) => /@(.+)$/.exec(link?.getAttribute("href") ?? "")?.[1] ?? null;

export const ReadingPane = forwardRef<PaperHandle, Props>(function ReadingPane(props, ref) {
  const { html, hidden, pin, lit, hint, foot } = props;
  const latest = useRef(props);
  latest.current = props;

  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const marks = useRef(new Map<string, HTMLElement[]>());
  const spans = useRef(new Map<string, { top: number; bottom: number }>());
  const headings = useRef<{ id: string; top: number }[]>([]);
  const pageTops = useRef<{ page: number; top: number }[]>([]);
  // A move the page made itself, and where it was going.
  const lock = useRef(0);
  const goal = useRef<number | null>(null);
  const arrive = useRef(0);
  const lastTarget = useRef<Target | null>(null);
  const userMoved = useRef(false);
  const lastScroll = useRef(0);
  const line = useRef<string | null>(null);
  const zone = useRef<Zone>("before");
  const section = useRef<string | null | undefined>(undefined);
  const followTimer = useRef(0);
  const settleTimer = useRef(0);
  const dwell = useRef(0);
  const pointed = useRef<Element | null>(null);
  const anchor = useRef<{ el: HTMLElement; offset: number } | null>(null);
  const measuredWidth = useRef(0);
  const [bars, setBars] = useState<Bar[]>([]);
  const [zoom, setZoom] = useState<{ src: string; alt: string; caption: string } | null>(null);
  const zoomed = useRef<HTMLDialogElement>(null);

  const measure = useCallback(() => {
    const el = scroller.current;
    const page = sheet.current;
    if (!el || !page || !el.clientHeight) return;
    const origin = el.getBoundingClientRect().top - el.scrollTop;
    const sheetTop = page.getBoundingClientRect().top;
    const next: Bar[] = [];
    spans.current.clear();
    for (const [id, parts] of marks.current) {
      const boxes = parts.map((part) => part.getBoundingClientRect());
      const top = Math.min(...boxes.map((b) => b.top));
      const bottom = Math.max(...boxes.map((b) => b.bottom));
      spans.current.set(id, { top: top - origin, bottom: bottom - origin });
      next.push({ id, top: top - sheetTop, height: bottom - top });
    }
    headings.current = [...page.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map((h) => ({ id: h.id, top: h.getBoundingClientRect().top - origin }));
    pageTops.current = [...page.querySelectorAll<HTMLElement>(".sheet__text a.pg")].map((a) => ({ page: Number(a.dataset.page), top: a.getBoundingClientRect().top - origin })).sort((a, b) => a.page - b.page);
    setBars(next);
  }, []);

  /** Write the statement under the line onto the page. Nothing here waits. */
  const paintLine = useCallback((id: string | null) => {
    if (line.current === id) return;
    if (line.current) {
      marks.current.get(line.current)?.forEach((el) => el.classList.remove("is-active"));
      sheet.current?.querySelector(`.tie[data-passage="${CSS.escape(line.current)}"]`)?.classList.remove("is-active");
    }
    line.current = id;
    if (id) {
      marks.current.get(id)?.forEach((el) => el.classList.add("is-active"));
      sheet.current?.querySelector(`.tie[data-passage="${CSS.escape(id)}"]`)?.classList.add("is-active");
    }
  }, []);

  const whereNow = useCallback((): Where => {
    const el = scroller.current;
    if (!el) return { passage: null, zone: "before", section: null, page: 1, into: 0 };
    const at = el.scrollTop + el.clientHeight * READING_LINE;
    // At the very end the last headings can never reach the reading line.
    const low = el.scrollTop + el.clientHeight * (el.scrollTop + el.clientHeight >= el.scrollHeight - 4 ? 1 : READING_LINE);
    let current: string | null = null;
    for (const h of headings.current) if (h.top <= low) current = h.id;
    let best: string | null = null;
    let bestGap = el.clientHeight * 0.5;
    let first = Infinity;
    let last = -Infinity;
    for (const passage of latest.current.passages) {
      const span = spans.current.get(passage.id);
      if (!span) continue;
      first = Math.min(first, span.top);
      last = Math.max(last, span.bottom);
      const gap = at < span.top ? span.top - at : at > span.bottom ? at - span.bottom : 0;
      if (gap <= bestGap) {
        best = passage.id;
        bestGap = gap;
      }
    }
    const kind: Zone = best ? "tied" : at < first ? "before" : at > last ? "after" : "between";
    let page = 1;
    let into = 0;
    const tops = pageTops.current;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i].top > at) break;
      page = tops[i].page;
      const next = tops[i + 1]?.top ?? el.scrollHeight;
      into = (at - tops[i].top) / Math.max(1, next - tops[i].top);
    }
    return { passage: best, zone: kind, section: current, page, into };
  }, []);

  const followSoon = useCallback((id: string | null, kind: Zone) => {
    window.clearTimeout(followTimer.current);
    followTimer.current = window.setTimeout(() => latest.current.onFollow(id, kind), FOLLOW_MS);
  }, []);

  /** What the reading line shows now. */
  const read = useCallback(() => {
    const here = whereNow();
    if (here.section !== section.current) {
      section.current = here.section;
      latest.current.onSection(here.section);
    }
    if (here.passage !== line.current || here.zone !== zone.current) {
      paintLine(here.passage);
      zone.current = here.zone;
      followSoon(here.passage, here.zone);
    }
  }, [followSoon, paintLine, whereNow]);

  const stopPointing = useCallback(() => {
    window.clearTimeout(dwell.current);
    if (pointed.current) {
      pointed.current = null;
      sheet.current?.querySelectorAll(".is-hover").forEach((el) => el.classList.remove("is-hover"));
      latest.current.onPoint(null);
    }
  }, []);

  const scrollTo = useCallback((top: number, instant: boolean, thenRead: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const end = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    goal.current = end;
    window.clearTimeout(arrive.current);
    if (prefersReduced() || instant) {
      el.scrollTop = end;
      lock.current = Date.now() + 60;
      if (thenRead) {
        goal.current = null;
        read();
      }
      return;
    }
    lock.current = Date.now() + 1500;
    el.scrollTo({ top: end, behavior: "smooth" });
    // A background tab may never run the animation, so arrive regardless.
    arrive.current = window.setTimeout(() => {
      if (Math.abs(el.scrollTop - end) > 2) el.scrollTop = end;
      lock.current = 0;
      if (thenRead) {
        goal.current = null;
        read();
      }
    }, 950);
  }, [read]);

  const elementFor = useCallback((id: string) => sheet.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ?? null, []);

  const place = useCallback(
    (target: Target, instant = false): boolean => {
      const el = scroller.current;
      if (!el) return false;
      lastTarget.current = target;
      userMoved.current = false;
      const origin = el.getBoundingClientRect().top - el.scrollTop;
      if ("start" in target) {
        scrollTo(0, instant, true);
        return true;
      }
      if ("top" in target) {
        if (target.fallback && Math.abs(target.width - el.clientWidth) > 1) return place(target.fallback, instant);
        scrollTo(target.top, true, true);
        return true;
      }
      if ("passage" in target) {
        const span = spans.current.get(target.passage);
        if (!span) return false;
        paintLine(target.passage);
        zone.current = "tied";
        scrollTo(span.top - el.clientHeight * READING_LINE, instant, false);
        followSoon(target.passage, "tied");
        return true;
      }
      if ("page" in target) {
        const at = pageTops.current.find((p) => p.page === target.page);
        const next = pageTops.current.find((p) => p.page === target.page + 1);
        if (!at) return false;
        const down = next ? (next.top - at.top) * (target.into ?? 0) : 0;
        scrollTo(at.top + down - el.clientHeight * READING_LINE, instant, true);
        return true;
      }
      const element = "element" in target ? target.element : elementFor(target.place);
      if (!element) return false;
      scrollTo(element.getBoundingClientRect().top - origin - ("element" in target ? el.clientHeight * READING_LINE : 24), instant, true);
      return true;
    },
    [elementFor, followSoon, paintLine, scrollTo],
  );

  /** A key for each reference opened in place: which link opened it. */
  const links = useCallback(() => [...(sheet.current?.querySelectorAll<HTMLAnchorElement>(".sheet__text a") ?? [])].filter((a) => !a.closest(".inset")), []);

  const removeInset = useCallback((inset: HTMLElement) => {
    const key = inset.dataset.link;
    inset.remove();
    if (key) links()[Number(key)]?.removeAttribute("aria-expanded");
  }, [links]);

  /** Open a copy of a reference or a figure under the block that mentions it. */
  const openInset = useCallback((id: string, link: HTMLElement) => {
    const block = link.closest<HTMLElement>("p, li, figcaption, aside");
    const source = elementFor(id);
    if (!block || !source) return;
    const inset = document.createElement("div");
    inset.className = `inset inset--${id.startsWith("fig-") ? "figure" : "cite"}`;
    inset.dataset.for = id;
    inset.dataset.link = String(links().indexOf(link as HTMLAnchorElement));
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copy.querySelectorAll(".is-active, .is-lit, .is-hover").forEach((el) => el.classList.remove("is-active", "is-lit", "is-hover"));
    copy.querySelectorAll(".pg").forEach((el) => el.remove());
    copy.querySelectorAll("[tabindex]").forEach((el) => el.removeAttribute("tabindex"));
    const actions = document.createElement("span");
    actions.className = "inset__actions";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "inset__go";
    go.textContent = id.startsWith("fig-") ? `Go to ${link.textContent?.trim() || "the figure"}` : "Go to the reference list";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "inset__close";
    close.textContent = "Close";
    actions.append(go, close);
    inset.append(copy, actions);
    block.after(inset);
    link.setAttribute("aria-expanded", "true");
  }, [elementFor, links]);

  useEffect(() => {
    if (zoom) zoomed.current?.showModal();
  }, [zoom]);

  useImperativeHandle(ref, (): PaperHandle => ({
    place,
    top: () => scroller.current?.scrollTop ?? 0,
    width: () => scroller.current?.clientWidth ?? 0,
    where: whereNow,
    focusPassage: (id) => marks.current.get(id)?.[0]?.focus({ preventScroll: true }),
    mark: (id) => paintLine(id),
    insets: () => [...(sheet.current?.querySelectorAll<HTMLElement>(".inset") ?? [])].map((i) => `${i.dataset.link}:${i.dataset.for}`),
    setInsets: (keys) => {
      const open = new Map([...(sheet.current?.querySelectorAll<HTMLElement>(".inset") ?? [])].map((i) => [`${i.dataset.link}:${i.dataset.for}`, i]));
      for (const [key, inset] of open) if (!keys.includes(key)) removeInset(inset);
      const all = links();
      for (const key of keys) {
        if (open.has(key)) continue;
        const [index, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        const link = all[Number(index)];
        if (link) openInset(id, link);
      }
      measure();
    },
    closeInsets: () => {
      const open = [...(sheet.current?.querySelectorAll<HTMLElement>(".inset") ?? [])];
      open.forEach(removeInset);
      if (open.length) measure();
      return open.length > 0;
    },
  }), [links, measure, openInset, paintLine, place, removeInset, whereNow]);

  // Index the marks once, then keep their positions as the layout changes.
  useLayoutEffect(() => {
    const page = sheet.current;
    if (!page) return;
    const found = new Map<string, HTMLElement[]>();
    page.querySelectorAll<HTMLElement>(".q").forEach((el) => {
      for (const id of (el.dataset.p ?? "").split(" ")) found.set(id, [...(found.get(id) ?? []), el]);
    });
    marks.current = found;
    const seen = new Set<HTMLElement>();
    for (const passage of latest.current.passages) {
      const first = found.get(passage.id)?.[0];
      if (first && !seen.has(first)) {
        seen.add(first);
        first.tabIndex = 0;
        first.setAttribute("aria-label", `Tied to the Lean, ${passage.lean.join(", ")}: ${passage.quote}`);
      }
    }
    measure();
    latest.current.onReady();
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      measure();
      if (lastTarget.current && !userMoved.current) place(lastTarget.current, true);
    });
    return () => {
      live = false;
    };
  }, [html, measure, place]);

  useEffect(() => {
    const page = sheet.current;
    const el = scroller.current;
    if (!page || !el) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      // Rewrapped lines move everything: keep the reader on the same words.
      const held = anchor.current;
      const width = el.clientWidth;
      if (!width) return;
      if (held && measuredWidth.current && width !== measuredWidth.current && held.el.isConnected) {
        const now = held.el.getBoundingClientRect().top - el.getBoundingClientRect().top;
        lock.current = Date.now() + 80;
        el.scrollTop += now - held.offset;
      }
      measuredWidth.current = width;
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 60);
    });
    observer.observe(page);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (!hidden) measure();
  }, [hidden, measure]);

  useEffect(() => {
    const page = sheet.current;
    if (!page) return;
    page.querySelectorAll<HTMLElement>(".is-lit").forEach((el) => el.classList.remove("is-lit"));
    for (const id of lit) {
      marks.current.get(id)?.forEach((el) => el.classList.add("is-lit"));
      page.querySelector(`.tie[data-passage="${CSS.escape(id)}"]`)?.classList.add("is-lit");
    }
  }, [bars, lit]);

  const held = pin?.passage ?? null;
  useEffect(() => {
    const page = sheet.current;
    if (!page) return;
    page.querySelectorAll<HTMLElement>(".is-pinned").forEach((el) => el.classList.remove("is-pinned"));
    if (held) {
      marks.current.get(held)?.forEach((el) => el.classList.add("is-pinned"));
      page.querySelector(`.tie[data-passage="${CSS.escape(held)}"]`)?.classList.add("is-pinned");
    }
  }, [bars, held]);

  /** Whether a held statement has left the view. */
  const pinLeft = useCallback(() => {
    const el = scroller.current;
    const current = latest.current.pin;
    if (!el || !current) return false;
    if (current.passage) {
      const span = spans.current.get(current.passage);
      return !!span && (span.bottom < el.scrollTop || span.top > el.scrollTop + el.clientHeight);
    }
    return current.at !== null && Math.abs(el.scrollTop - current.at) > el.clientHeight * 0.9;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const tick = () => {
      frame = 0;
      if (Date.now() < lock.current) {
        // A long move still reports the section it is passing.
        const here = whereNow();
        if (here.section !== section.current) {
          section.current = here.section;
          latest.current.onSection(here.section);
        }
        return;
      }
      if (goal.current !== null) {
        if (Math.abs(el.scrollTop - goal.current) <= 2) return;
        goal.current = null;
      }
      if (pinLeft()) latest.current.onPinLeft();
      read();
    };
    const onScroll = () => {
      lastScroll.current = Date.now();
      stopPointing();
      if (!frame) frame = requestAnimationFrame(tick);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        // Remember what sits at the top of the view, for a change of width.
        const top = el.getBoundingClientRect().top;
        let nearest: HTMLElement | null = null;
        let gap = Infinity;
        for (const [, parts] of marks.current) {
          const d = Math.abs(parts[0].getBoundingClientRect().top - top);
          if (d < gap) {
            gap = d;
            nearest = parts[0];
          }
        }
        if (nearest) anchor.current = { el: nearest, offset: nearest.getBoundingClientRect().top - top };
        latest.current.onSettle();
      }, 220);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer.current);
    };
  }, [pinLeft, read, stopPointing, whereNow]);

  useEffect(() => () => {
    window.clearTimeout(arrive.current);
    window.clearTimeout(dwell.current);
  }, []);

  const flash = (element: HTMLElement) => {
    element.classList.remove("is-flash");
    void element.offsetWidth;
    element.classList.add("is-flash");
    window.setTimeout(() => element.classList.remove("is-flash"), 1200);
  };

  const inView = (element: HTMLElement) => {
    const pane = scroller.current?.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return !!pane && box.top >= pane.top && box.bottom <= pane.bottom;
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    window.clearTimeout(dwell.current);
    if (target.closest(".inset__close")) {
      const inset = target.closest<HTMLElement>(".inset");
      if (inset) removeInset(inset);
      measure();
      return;
    }
    if (target.closest(".inset__go")) {
      const id = target.closest<HTMLElement>(".inset")?.dataset.for;
      if (id) latest.current.onJump(id);
      return;
    }
    const plot = target.closest<HTMLElement>(".zoom");
    if (plot) {
      event.preventDefault();
      const image = plot.querySelector("img");
      if (image) setZoom({ src: image.src, alt: image.alt, caption: plot.closest("figure")?.querySelector("figcaption")?.textContent ?? "" });
      return;
    }
    const tick = target.closest<HTMLElement>(".tie");
    if (tick?.dataset.passage) {
      latest.current.onPin(tick.dataset.passage);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a");
    if (link) {
      if (link.classList.contains("nm")) {
        event.preventDefault();
        // A line of code tied to the Lean goes to its exact lines, not to the first name on it.
        const tied = link.closest<HTMLElement>("pre .q");
        if (tied?.dataset.p) latest.current.onPin(tied.dataset.p.split(" ")[0]);
        else latest.current.onName(link.dataset.name ?? "");
        return;
      }
      if (link.classList.contains("pg")) {
        event.preventDefault();
        latest.current.onPage(Number(link.dataset.page));
        return;
      }
      const id = goalOf(link);
      if (!id) return;
      event.preventDefault();
      const source = elementFor(id);
      if (source && inView(source)) {
        // Already on the page: say so where it stands, and go nowhere.
        flash(source);
        return;
      }
      if (id.startsWith("cite-") || id.startsWith("fig-")) {
        const block = link.closest<HTMLElement>("p, li, figcaption, aside");
        const open = block?.parentElement?.querySelector<HTMLElement>(`:scope > .inset[data-for="${CSS.escape(id)}"]`);
        if (open) removeInset(open);
        else openInset(id, link);
        measure();
      } else latest.current.onJump(id);
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const mark = target.closest<HTMLElement>(".q");
    if (mark?.dataset.p) latest.current.onPin(mark.dataset.p.split(" ")[0]);
  };

  /** What a pointer or focus has landed on. */
  const pointAt = (element: Element | null): { el: Element; pointed: Pointed } | null => {
    const name = element?.closest<HTMLElement>("a.nm");
    if (name?.dataset.name) return { el: name, pointed: { kind: "name", id: name.dataset.name, passage: name.closest<HTMLElement>(".q")?.dataset.p?.split(" ")[0] } };
    const link = element?.closest<HTMLAnchorElement>(".sheet__text a");
    const id = link && !link.classList.contains("pg") ? goalOf(link) : null;
    if (link && id) {
      const source = elementFor(id);
      const words = (source?.querySelector("figcaption") ?? source)?.textContent?.replace(/\s+/g, " ").trim();
      if (words) return { el: link, pointed: { kind: "text", title: link.textContent?.trim() ?? "", text: words } };
    }
    const mark = element?.closest<HTMLElement>(".q") ?? null;
    const tick = element?.closest<HTMLElement>(".tie") ?? null;
    const passage = mark?.dataset.p?.split(" ")[0] ?? tick?.dataset.passage;
    if (passage) return { el: mark ?? tick!, pointed: { kind: "passage", id: passage } };
    return null;
  };

  const point = (element: Element | null) => {
    if (Date.now() - lastScroll.current < 180) return;
    const next = pointAt(element);
    if (next?.el === pointed.current) return;
    stopPointing();
    if (!next) return;
    pointed.current = next.el;
    const washed = next.pointed?.kind === "passage" ? next.pointed.id : next.pointed?.kind === "name" ? next.pointed.passage : undefined;
    if (washed) {
      marks.current.get(washed)?.forEach((el) => el.classList.add("is-hover"));
      sheet.current?.querySelector(`.tie[data-passage="${CSS.escape(washed)}"]`)?.classList.add("is-hover");
    }
    const what = next.pointed;
    dwell.current = window.setTimeout(() => latest.current.onPoint(what), DWELL_MS);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.classList.contains("q") && target.dataset.p) {
      event.preventDefault();
      event.stopPropagation();
      latest.current.onPin(target.dataset.p.split(" ")[0]);
    }
  };

  const userInput = () => {
    userMoved.current = true;
    lock.current = 0;
    goal.current = null;
    lastTarget.current = null;
    window.clearTimeout(arrive.current);
  };

  return (
    <div
      className="reading"
      data-paper-pane={hidden ? undefined : ""}
      hidden={hidden}
      ref={scroller}
      tabIndex={0}
      aria-label="The paper"
      onWheel={userInput}
      onTouchMove={userInput}
      onPointerDown={(event) => {
        if (event.target === scroller.current) userInput();
      }}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) userInput();
        onKeyDown(event);
      }}
    >
      <div
        className="sheet"
        ref={sheet}
        onClick={onClick}
        onMouseOver={(event) => point(event.target as Element)}
        onMouseLeave={stopPointing}
        onFocus={(event) => point(event.target as Element)}
        onBlur={stopPointing}
      >
        {hint}
        <Sheet html={html} />
        <div className="sheet__ties" aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.id} data-passage={bar.id} className="tie" style={{ top: bar.top, height: bar.height }} />
          ))}
        </div>
      </div>
      {foot}
      <dialog className="plot" ref={zoomed} onClose={() => setZoom(null)} onClick={() => zoomed.current?.close()}>
        {zoom && (
          <>
            <img src={zoom.src} alt={zoom.alt} />
            <p>{zoom.caption}</p>
          </>
        )}
      </dialog>
    </div>
  );
});

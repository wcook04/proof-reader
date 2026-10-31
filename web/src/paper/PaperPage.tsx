// One paper, laid out as an open book: the authors' paper on the left page, read as
// any paper is read, and on the right a page with two modes, Graph and Lean.
//
// Four verbs. Follow: the reading line picks a statement and the right page answers.
// Point: a dwell names it under the graph, and previews it in Lean mode. Open: a click goes
// to Lean mode on that thing, pushes one history entry and gives it an address. Back: the
// browser's own Back, named on the page, which restores everything an entry remembers. The
// toggle, Escape and Unpin land where Back lands. Chosen on the toggle, the Lean follows.

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { blankEntry, newEntryId, pushEntry, readEntry, replaceEntry, returning, type Copy, type Entry, type Pin, type Tab } from "../app/history";
import { paperFile, type Edition, type Passage } from "../app/edition";
import { Lockup, SisterSites } from "../app/Family";
import { readRoute, routeHref } from "../app/router";
import { setScheme, useScheme } from "../app/theme";
import type { LeanActions } from "../lean/code";
import { editionGraph, sectionLabel } from "../model/fromEdition";
import { LeanPage, type LeanPageHandle, type Step } from "../proof/LeanPage";
import { MapPane, type MapPaneHandle } from "../proof/MapPane";
import type { PaneMode } from "../proof/ModeToggle";
import { ProofPage, readLayout, saveLayout, type Layout } from "../proof/ProofPage";
import { Contents } from "./Contents";
import { ReadingPane } from "./ReadingPane";
import { Threads } from "./Threads";
import { DWELL_MS, type Follow, type PaperHandle, type Pointed, type Target, type Zone } from "./reading-line";

const PdfPane = lazy(() => import("./PdfPane").then((module) => ({ default: module.PdfPane })));

interface Opened {
  entry: Partial<Entry>;
  target: Target | null;
  bad: string | null;
}

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setOn(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  return on;
}

/** The sentence that best states a declaration: its statement or definition first. */
function bestPassage(edition: Edition, id: string): string | null {
  const own = edition.passages.filter((p) => p.lean.includes(id));
  return (own.find((p) => p.lean[0] === id && (p.role === "states" || p.role === "defines")) ?? own.find((p) => p.role === "states" || p.role === "defines") ?? own[0])?.id ?? null;
}

/** What an address means in this paper. */
function resolve(edition: Edition, record: string | undefined, extra: string | undefined): Opened {
  if (extra) return { entry: {}, target: { start: true }, bad: `${record}/${extra}` };
  if (!record) return { entry: {}, target: { start: true }, bad: null };
  if (record === "@declarations") return { entry: { tab: "index", lean: true }, target: null, bad: null };
  if (record === "@file") return { entry: { tab: "file", lean: true }, target: null, bad: null };
  if (record.startsWith("@")) {
    const at = record.slice(1);
    if (edition.passages.some((p) => p.id === at)) return { entry: { pin: { passage: at, decl: null, at: null }, lean: true }, target: { passage: at }, bad: null };
    const page = /^page-(\d+)$/.exec(at);
    if (page) {
      const n = Number(page[1]);
      if (n >= 1 && n <= edition.paper.pages) return { entry: { copy: "pdf" }, target: { page: n }, bad: null };
      return { entry: {}, target: { start: true }, bad: record };
    }
    return { entry: {}, target: { place: at }, bad: null };
  }
  const claim = edition.claims.find((c) => c.id === record);
  if (claim) return { entry: { pin: { passage: claim.passage, decl: null, at: null }, lean: true }, target: { passage: claim.passage }, bad: null };
  if (edition.declarations.some((d) => d.id === record)) {
    const passage = bestPassage(edition, record);
    return { entry: { pin: { passage, decl: record, at: null }, lean: true }, target: passage ? { passage } : null, bad: null };
  }
  return { entry: {}, target: { start: true }, bad: record };
}

export function PaperPage({ edition }: { edition: Edition }) {
  const slug = edition.slug;
  const { paper, lean } = edition;
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const declarations = useMemo(() => new Map(edition.declarations.map((d) => [d.id, d])), [edition]);
  const outline = useMemo(() => edition.reading?.outline ?? [], [edition]);
  const homeCopy: Copy = edition.reading ? "reading" : "pdf";

  const started = useRef<{ entry: Entry; target: Target | null; record: string | undefined } | null>(null);
  if (!started.current) {
    const route = readRoute();
    const saved = readEntry(slug, returning());
    const meaning = resolve(edition, route.record, route.extra);
    if (saved) {
      replaceEntry(saved);
      started.current = { entry: saved, target: saved.top !== null ? { top: saved.top, width: saved.width, fallback: meaning.target ?? undefined } : meaning.target, record: route.record };
    } else {
      const entry: Entry = { ...blankEntry(slug, homeCopy), lean: readLayout().lean, ...meaning.entry, bad: meaning.bad };
      replaceEntry(entry);
      started.current = { entry, target: meaning.target, record: route.record };
    }
  }

  const [entry, setEntry] = useState<Entry>(started.current.entry);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [html, setHtml] = useState<string | null>(null);
  const [pdfSeen, setPdfSeen] = useState(entry.copy === "pdf");
  const [section, setSection] = useState<string | null>(null);
  const [line, setLine] = useState<{ id: string | null; zone: Zone; above: string | null }>({ id: null, zone: "before", above: null });
  const [point, setPoint] = useState<Pointed>(null);
  const [cardPoint, setCardPoint] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [mapStays, setMapStays] = useState(false);
  const [tick, setTick] = useState(0);

  const wide = useMedia("(min-width: 1280px)");
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const onLayout = useCallback((next: Layout) => {
    setLayoutState(next);
    saveLayout(next);
  }, []);
  const scheme = useScheme();

  const reading = useRef<PaperHandle>(null);
  const pdf = useRef<PaperHandle>(null);
  const map = useRef<MapPaneHandle>(null);
  const leanPage = useRef<LeanPageHandle>(null);
  const pending = useRef<{ target: Target; instant: boolean; insets?: string[]; record?: string } | null>(started.current.target ? { target: started.current.target, instant: true, insets: started.current.entry.insets, record: started.current.record } : null);
  const rightPending = useRef<{ leanTop: number; scene: Entry["scene"]; paused: boolean } | null>(null);
  const leftReading = useRef<{ top: number; width: number; page: number } | null>(null);
  const stepAt = useRef(-1);
  const lastPassage = useRef<string | null>(null);
  const dwell = useRef(0);
  const cardsQuiet = useRef(0);

  const spread = useRef<HTMLElement>(null);
  const pane = useCallback(() => (entryRef.current.copy === "pdf" ? pdf.current : reading.current), []);

  useEffect(() => {
    if (!edition.reading) return;
    let live = true;
    fetch(paperFile(slug, "reading.html"))
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => live && setHtml(text), () => {
        if (!live) return;
        setPdfSeen(true);
        setEntry((e) => ({ ...e, copy: "pdf" }));
      });
    return () => {
      live = false;
    };
  }, [edition, slug]);

  /** Put the paper where it is waiting to go, once its pane can take it. */
  const flush = useCallback(() => {
    const next = pending.current;
    const handle = pane();
    if (!next || !handle || !handle.width()) return;
    pending.current = null;
    if (next.insets) handle.setInsets(next.insets);
    if (handle.place(next.target, next.instant) || !next.record) return;
    // The place does not exist: say so, and open at the start.
    handle.place({ start: true }, true);
    const marked = { ...entryRef.current, bad: next.record };
    entryRef.current = marked;
    setEntry(marked);
    replaceEntry(marked);
  }, [pane]);

  useLayoutEffect(() => {
    flush();
    const right = rightPending.current;
    if (right) {
      rightPending.current = null;
      leanPage.current?.setTop(right.leanTop);
      map.current?.restore(right.scene, right.paused);
    }
  }, [flush, tick, entry.copy, html]);

  /** The current entry with what only the panes know, ready to write down. */
  const snapshot = useCallback((): Entry => {
    const cur = entryRef.current;
    const handle = pane();
    if (!handle || !handle.width() || pending.current) return cur;
    return {
      ...cur,
      top: handle.top(),
      width: handle.width(),
      insets: handle.insets(),
      leanTop: leanPage.current?.top() ?? cur.leanTop,
      scene: map.current?.scene() ?? cur.scene,
      mapPaused: map.current?.paused() ?? cur.mapPaused,
    };
  }, [pane]);

  const saveNow = useCallback(() => {
    const next = snapshot();
    entryRef.current = next;
    replaceEntry(next);
  }, [snapshot]);

  /** The paper's own place as a reader would name it. */
  const paperLabel = useCallback(() => {
    const handle = pane();
    const where = handle?.where();
    if (entryRef.current.copy === "pdf") return `page ${where?.page ?? 1}`;
    const heading = outline.find((e) => e.id === where?.section);
    return heading ? (heading.number ? sectionLabel(heading.number) : heading.title) : "the start";
  }, [outline, pane]);

  const pinLabel = (pin: Pin) => {
    const id = pin.decl ?? passages.get(pin.passage ?? "")?.lean[0];
    return id ? declarations.get(id)?.plain ?? null : null;
  };

  /** Open something: one history entry, with an address and a way back. */
  const open = useCallback(
    (o: { record?: string; pin?: Pin | null; tab?: Tab; copy?: Copy; target?: Target | null; from?: "paper" | "right"; sheet?: boolean; stay?: boolean; lean?: boolean; wentToLean?: boolean; after?: () => void }) => {
      saveNow();
      o.after?.();
      const cur = entryRef.current;
      const copy = o.copy ?? cur.copy;
      const label = o.from === "right" && cur.pin ? (pinLabel(cur.pin) ?? paperLabel()) : paperLabel();
      const next: Entry = {
        ...cur,
        id: newEntryId(),
        copy,
        pin: o.pin === undefined ? cur.pin : o.pin,
        tab: o.tab ?? "step",
        top: o.target ? null : cur.top,
        leanTop: 0,
        lean: o.lean ?? (o.pin ? true : layoutRef.current.lean),
        wentToLean: !!o.wentToLean,
        opened: (o.pin === undefined ? cur.pin : o.pin) || (o.tab ?? "step") !== "step"
          ? cur.opened ? { steps: cur.opened.steps + 1, fromGraph: cur.opened.fromGraph } : cur.pin || cur.tab !== "step" ? null : { steps: 1, fromGraph: !cur.lean }
          : null,
        insets: pane()?.insets() ?? cur.insets,
        back: label,
        backSide: o.from ?? "paper",
        sheet: o.sheet ?? (!wide ? true : cur.sheet),
        bad: null,
      };
      pushEntry(next, routeHref({ paper: slug, record: o.record }));
      entryRef.current = next;
      setEntry(next);
      setRail(false);
      setPoint(null);
      setCardPoint(null);
      window.clearTimeout(dwell.current);
      // The graph may pan under a resting pointer now: that is not pointing.
      cardsQuiet.current = Date.now() + 1200;
      setMapStays(!!o.stay);
      if (copy === "pdf") setPdfSeen(true);
      if (o.target) {
        pending.current = { target: o.target, instant: false, record: o.record };
        setTick((t) => t + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pane, paperLabel, saveNow, slug, wide],
  );

  /** Follow the address the browser now holds: Back, Forward, or one typed in. */
  const sync = useCallback(() => {
    const route = readRoute();
    if (route.paper !== slug) return;
    const saved = readEntry(slug, true);
    const cur = entryRef.current;
    if (saved?.id === cur.id) return;
    const meaning = resolve(edition, route.record, route.extra);
    setPoint(null);
    setCardPoint(null);
    setRail(false);
    setMapStays(false);
    if (saved) {
      entryRef.current = saved;
      setEntry(saved);
      if (saved.copy === "pdf") setPdfSeen(true);
      const target = saved.top !== null ? { top: saved.top, width: saved.width, fallback: meaning.target ?? undefined } : meaning.target;
      pending.current = target ? { target, instant: true, insets: saved.insets, record: route.record } : null;
      rightPending.current = { leanTop: saved.leanTop, scene: saved.scene, paused: saved.mapPaused };
    } else {
      // Typed or pasted: the browser has already made the entry, so fill it in.
      const next: Entry = {
        ...blankEntry(slug, homeCopy),
        lean: cur.lean,
        ...meaning.entry,
        copy: meaning.entry.copy ?? cur.copy,
        back: paperLabel(),
        backSide: "paper",
        scene: cur.scene,
        sheet: !wide,
        bad: meaning.bad,
      };
      entryRef.current = next;
      replaceEntry(next);
      setEntry(next);
      if (next.copy === "pdf") setPdfSeen(true);
      pending.current = meaning.target ? { target: meaning.target, instant: false, record: route.record } : null;
    }
    setTick((t) => t + 1);
  }, [edition, homeCopy, paperLabel, slug, wide]);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [saveNow, sync]);

  /** The address of the nearest sentence, or of the block at the line where none is tied. */
  const hereRecord = useCallback((): string | undefined => {
    const handle = pane();
    if (!handle) return undefined;
    const where = handle.where();
    if (entryRef.current.copy === "pdf") return `@page-${where.page}`;
    if (handle.top() < 4) return undefined;
    const active = handle.active() ?? where.passage;
    if (active) return `@${active}`;
    const block = handle.block();
    return block ? `@${block}` : where.section ? `@${where.section}` : undefined;
  }, [pane]);

  /** The paper stopped: remember the pixel, and keep the address on the nearest sentence. */
  const settled = useCallback(() => {
    const handle = pane();
    if (!handle || pending.current) return;
    const cur = snapshot();
    entryRef.current = cur;
    const href = !cur.pin && cur.tab === "step" ? routeHref({ paper: slug, record: hereRecord() }) : undefined;
    replaceEntry(cur, href);
  }, [hereRecord, pane, slug, snapshot]);

  /** Remember the mode the reader chose. */
  const chooseMode = useCallback((lean: boolean) => {
    setLayoutState((was) => {
      const stored = { ...was, lean, graph: true };
      saveLayout(stored);
      return stored;
    });
  }, []);

  /** Let go here: an address that was opened directly has no entry to go back to. */
  const letGo = useCallback((lean: boolean) => {
    const next: Entry = { ...entryRef.current, pin: null, tab: "step", lean, opened: null, wentToLean: false };
    entryRef.current = next;
    setEntry(next);
    setMapStays(false);
    settled();
  }, [settled]);

  /**
   * The toggle. Choosing Lean with nothing open is one history entry, so Back undoes it.
   * Choosing Graph lands where Back from an opened statement lands: the browser's own Back
   * when that is where the reader came from, and in place otherwise. As Lean Exposition does.
   */
  const setMode = useCallback((mode: PaneMode) => {
    const cur = entryRef.current;
    if (mode === "lean") {
      if (cur.lean) return;
      chooseMode(true);
      open({ record: readRoute().record, pin: null, lean: true, wentToLean: true, stay: true, tab: "step" });
      return;
    }
    if (!cur.lean) return;
    chooseMode(false);
    if (cur.opened?.fromGraph) window.history.go(-cur.opened.steps);
    else if (cur.wentToLean && !cur.pin && cur.tab === "step") window.history.back();
    else letGo(false);
  }, [chooseMode, letGo, open]);

  /** Escape and Unpin: one level, from an opened statement to what was there, or from Lean to Graph. */
  const closeLean = useCallback(() => {
    const cur = entryRef.current;
    if (!cur.pin && cur.tab === "step") setMode("graph");
    else if (cur.opened) window.history.go(-cur.opened.steps);
    else letGo(layoutRef.current.lean);
  }, [letGo, setMode]);

  const onFollow = useCallback<Follow>((id, zone, above) => {
    setLine({ id, zone, above });
    if (above) lastPassage.current = above;
    const at = id ?? above;
    stepAt.current = at ? edition.passages.findIndex((p) => p.id === at) : -1;
  }, [edition]);

  const pinPassage = useCallback((id: string) => {
    const cur = entryRef.current;
    if (cur.pin?.passage === id && !cur.pin.decl && (wide || cur.sheet)) return;
    // The sheet takes the lower part of a small screen: keep the statement above it.
    const target = !wide && !cur.sheet ? { passage: id } : null;
    open({ record: `@${id}`, pin: { passage: id, decl: null, at: null }, target });
  }, [open, wide]);

  /** A Lean name: the Lean page walks there and the paper stays put. */
  const walk = useCallback((name: string, from: "paper" | "right" = "right") => {
    if (!declarations.has(name)) return;
    if (entryRef.current.pin?.decl === name && entryRef.current.tab === "step") return;
    open({ record: name, pin: { passage: null, decl: name, at: pane()?.top() ?? 0 }, from });
  }, [declarations, open, pane]);

  /** A card: the paper goes to the statement, the Lean opens, the graph stays. */
  const openCard = useCallback((id: string) => {
    const claim = edition.claims.find((c) => c.id === id);
    if (claim) {
      open({ record: id, pin: { passage: claim.passage, decl: null, at: null }, target: { passage: claim.passage }, stay: true });
      return;
    }
    const passage = bestPassage(edition, id);
    open({ record: id, pin: { passage, decl: id, at: passage ? null : pane()?.top() ?? 0 }, target: passage ? { passage } : null, stay: true });
  }, [edition, open, pane]);

  /** A sentence named on the Lean page: go there and hold it. */
  const goToPassage = useCallback((id: string) => {
    open({ record: `@${id}`, pin: { passage: id, decl: null, at: null }, target: { passage: id } });
  }, [open]);

  const jumpTo = useCallback((id: string) => {
    const cur = entryRef.current;
    const page = outline.find((e) => e.id === id)?.page;
    if (cur.copy === "pdf" && page) open({ record: `@page-${page}`, pin: null, target: { page } });
    else open({ record: `@${id}`, pin: null, target: { place: id } });
  }, [open, outline]);

  const jumpTop = useCallback(() => open({ record: undefined, pin: null, target: { start: true } }), [open]);
  const jumpPage = useCallback((page: number) => open({ record: `@page-${page}`, pin: null, target: { page } }), [open]);

  const jumpBlock = useCallback((element: HTMLElement, page: number) => {
    if (entryRef.current.copy === "pdf") open({ record: `@page-${page}`, pin: null, target: { page } });
    else open({ record: `@${pane()?.where().section ?? "s-1"}`, pin: null, target: { element } });
  }, [open, pane]);

  const switchCopy = useCallback((next: Copy, page?: number) => {
    const cur = entryRef.current;
    if (next === cur.copy && !page) return;
    const handle = pane();
    const where = handle?.where();
    const onPage = page ?? where?.page ?? 1;
    let target: Target = page ? { page } : { page: onPage, into: where?.into };
    if (cur.copy === "reading" && handle) leftReading.current = { top: handle.top(), width: handle.width(), page: onPage };
    if (next === "reading" && leftReading.current?.page === onPage) target = { top: leftReading.current.top, width: leftReading.current.width, fallback: target };
    open({ record: next === "pdf" ? `@page-${onPage}` : `@${where?.section ?? outline.find((e) => e.page >= onPage)?.id ?? "s-1"}`, copy: next, target, stay: true });
  }, [open, outline, pane]);

  const onTab = useCallback((tab: Tab) => {
    if (entryRef.current.tab === tab) return;
    const pin = entryRef.current.pin;
    const record = tab === "index" ? "@declarations" : tab === "file" ? "@file" : pin ? (pin.decl ?? `@${pin.passage}`) : hereRecord();
    open({ record, tab, from: "right", stay: true, lean: true });
  }, [hereRecord, open]);

  /** A reference opens in place. Back closes it, as it undoes any other open. */
  const openInset = useCallback((show: () => void) => {
    const cur = entryRef.current;
    open({ record: readRoute().record, pin: cur.pin, tab: cur.tab, lean: cur.lean, after: show, stay: true });
  }, [open]);

  const step = useCallback((by: number) => {
    const list = edition.passages;
    const handle = pane();
    if (!handle || !list.length) return;
    let at = stepAt.current;
    if (at < 0) at = line.zone === "after" ? list.length : -1;
    const index = Math.max(0, Math.min(list.length - 1, at + by));
    const next = list[index];
    if (!next) return;
    stepAt.current = index;
    if (entryRef.current.pin) {
      const unpinned = { ...entryRef.current, pin: null, lean: layoutRef.current.lean, opened: null };
      entryRef.current = unpinned;
      setEntry(unpinned);
    }
    setMapStays(false);
    handle.place({ passage: next.id });
    handle.focusPassage(next.id);
  }, [edition, line.zone, pane]);

  const onPoint = useCallback((pointed: Pointed) => setPoint(pointed), []);

  // A card rests under the pointer: preview it after the same dwell as a sentence.
  const onCardHover = useCallback((id: string | null) => {
    window.clearTimeout(dwell.current);
    if (id === null) setCardPoint(null);
    else if (Date.now() < cardsQuiet.current) return;
    else dwell.current = window.setTimeout(() => setCardPoint(id), DWELL_MS);
  }, []);

  const onPauseChange = useCallback((paused: boolean) => {
    if (!paused) setMapStays(false);
  }, []);

  const closePage = useCallback(() => onLayout({ ...layoutRef.current, graph: false }), [onLayout]);

  const closeSheet = useCallback(() => {
    const next = { ...entryRef.current, sheet: false, pin: null, lean: false };
    entryRef.current = next;
    setEntry(next);
    replaceEntry(next);
  }, []);

  // The keys a reader of a long page reaches for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.("input, textarea, select, dialog")) return;
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        window.history.back();
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        window.history.forward();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (pane()?.closeInsets()) return;
        if (rail) return setRail(false);
        if (entryRef.current.sheet && !wide) closeSheet();
        else if (entryRef.current.pin || entryRef.current.lean) closeLean();
        return;
      }
      if (target.closest?.(".tree, [role='separator']")) return;
      if (event.key === "g") {
        setMode(entryRef.current.lean ? "graph" : "lean");
      } else if (event.key === "[") {
        window.history.back();
      } else if (event.key === "]") {
        window.history.forward();
      } else if (event.key === "j" || event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "k" || event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "Enter" && !target.closest?.("a, button, [tabindex='0'].q")) {
        const id = pane()?.where().passage;
        if (id) pinPassage(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLean, closeSheet, pane, pinPassage, rail, setMode, step, wide]);

  // ---- What the right page shows --------------------------------------------------

  const pin = entry.pin;
  const claimPassage = edition.claims[0] ? passages.get(edition.claims[0].passage) ?? null : null;
  const pointedId = point?.kind === "passage" ? point.id : point?.kind === "name" ? point.passage : undefined;
  const pointedPassage = pointedId && pointedId !== pin?.passage ? passages.get(pointedId) ?? null : null;
  const pointedCard = cardPoint && cardPoint !== pin?.decl && !edition.claims.some((c) => c.id === cardPoint) ? cardPoint : null;
  const pointedClaim = cardPoint ? edition.claims.find((c) => c.id === cardPoint) : undefined;
  const lastTie = edition.passages[edition.passages.length - 1] ?? null;
  const here = useMemo(() => outline.find((e) => e.id === section), [outline, section]);
  const hereLabel = here ? (here.number ? sectionLabel(here.number) : here.title) : null;

  const shown = useMemo((): { mode: "preview" | "pin" | "line" | "start" | "between" | "after"; passage: Passage | null; decl: string | null } => {
    if (entry.lean && pointedPassage) return { mode: "preview", passage: pointedPassage, decl: null };
    if (entry.lean && pointedCard) return { mode: "preview", passage: null, decl: pointedCard };
    if (entry.lean && pointedClaim) return { mode: "preview", passage: passages.get(pointedClaim.passage) ?? null, decl: null };
    if (pin?.decl) return { mode: "pin", passage: null, decl: pin.decl };
    if (pin?.passage) return { mode: "pin", passage: passages.get(pin.passage) ?? null, decl: null };
    if (line.id) return { mode: "line", passage: passages.get(line.id) ?? null, decl: null };
    if (line.zone === "after") return { mode: "after", passage: null, decl: null };
    if (line.zone === "between" && lastPassage.current) return { mode: "between", passage: passages.get(lastPassage.current) ?? null, decl: null };
    return { mode: "start", passage: claimPassage, decl: null };
  }, [claimPassage, entry.lean, line, passages, pin, pointedCard, pointedClaim, pointedPassage]);

  const stepView = useMemo((): Step => {
    if (shown.mode === "after") return { key: "after", title: null, passage: null, decls: [], exact: null, untied: { section: hereLabel, last: lastTie } };
    if (shown.decl) return { key: `d:${shown.decl}`, title: null, passage: null, decls: [shown.decl], exact: null, untied: null };
    const passage = shown.passage;
    if (!passage) return { key: "none", title: null, passage: null, decls: [], exact: null, untied: { section: hereLabel, last: lastTie } };
    const title = shown.mode === "start" ? `The paper’s main claim, ${sectionLabel(passage.section)}` : `${sectionLabel(passage.section)}, page ${passage.page}`;
    return { key: `p:${passage.id}`, title, passage, decls: passage.lean, exact: passage.lines ?? null, untied: null };
  }, [hereLabel, lastTie, shown]);

  const lit = useMemo(() => stepView.decls, [stepView]);
  const pointedName = point?.kind === "name" ? point.id : null;
  const pointedIds = useMemo(() => {
    const ids = pointedName ? [pointedName] : cardPoint ? [cardPoint] : pointedPassage?.lean ?? [];
    return ids.length ? new Set(ids) : null;
  }, [cardPoint, pointedName, pointedPassage]);

  // Every statement tied to what is held or pointed at takes the soft wash.
  const litPassages = useMemo(() => {
    const out = new Set<string>();
    const ids = pointedName ? [pointedName] : cardPoint ? [cardPoint] : pin?.decl ? [pin.decl] : [];
    for (const id of ids) for (const p of declarations.get(id)?.passages ?? []) out.add(p);
    if (pointedClaim) out.add(pointedClaim.passage);
    return out;
  }, [cardPoint, declarations, pin, pointedClaim, pointedName]);

  // The bar reads the statement in hand; what has been reached is read from the page.
  const activeId = pin?.passage ?? line.id;
  const order = activeId ? edition.passages.findIndex((p) => p.id === activeId) : -1;
  const aboveIndex = line.above ? edition.passages.findIndex((p) => p.id === line.above) : -1;
  const reached = line.zone === "after" ? edition.passages.length : Math.max(aboveIndex + 1, line.id ? edition.passages.findIndex((p) => p.id === line.id) + 1 : 0);
  const passed = useMemo(() => {
    const out = new Set<string>();
    edition.passages.slice(0, Math.max(0, reached - 1)).forEach((p) => p.lean.forEach((id) => out.add(id)));
    return out;
  }, [edition, reached]);
  const reachedDecls = useMemo(() => new Set([...passed, ...lit]).size, [lit, passed]);

  const back = useCallback(() => window.history.back(), []);
  const firstTie = edition.coverage.sections[0];
  const lastSection = edition.coverage.sections[edition.coverage.sections.length - 1];

  const plainOf = useCallback((id: string | undefined) => (id ? declarations.get(id)?.plain ?? id : ""), [declarations]);
  const name = plainOf(stepView.decls[0]);
  const says = (() => {
    if (shown.mode === "preview") return <><b>Previewing</b> {plainOf(shown.decl ?? undefined) || stepView.title}. Move away to return.</>;
    if (shown.mode === "pin") return <><b>Pinned</b> {plainOf(pin?.decl ?? undefined) || stepView.title}<button type="button" className="proof__unpin" onClick={closeLean}>Unpin</button></>;
    if (shown.mode === "after") return <><b>{hereLabel ? `Nothing in ${hereLabel} is in this Lean.` : "Nothing here is in this Lean."}</b> It covers {sectionLabel(firstTie)} to {sectionLabel(lastSection)}.</>;
    if (shown.mode === "between") return <><b>No statement at this line.</b> The last was {name}.</>;
    if (shown.mode === "start") return <><b>Before the first statement,</b> in {sectionLabel(firstTie)}. Showing the main claim.</>;
    return <><b>Following the paper:</b> {stepView.title}</>;
  })();

  const backButton = entry.back && <button type="button" className="back" onClick={back} title="Your browser’s Back ( [ or Alt + Left )">Back to {entry.back}</button>;

  const pointedDecl = pointedName ? declarations.get(pointedName) : null;
  const hasLean = (ids: string[]) => ids.map((id) => declarations.get(id)).filter((d) => !!d);
  const named = hasLean(pointedCard ? [pointedCard] : pointedPassage?.lean ?? pointedClaim?.lean ?? []);
  const readingStrip = pointedDecl ? (
    <p><b>{pointedDecl.plain}.</b> <code className="proof__sig">{pointedDecl.id} : {pointedDecl.type}</code></p>
  ) : point?.kind === "text" ? (
    <p><b>{point.title}.</b> {point.text}</p>
  ) : named.length ? (
    <p><b>{named.map((d) => d.plain).join(", ")}</b> <code className="proof__sig">{named.map((d) => d.id).join(", ")}</code>. It has Lean: {named.map((d) => `lines ${d.line} to ${d.end_line}`).join(", ")}. Click to read it.</p>
  ) : entry.lean ? null : line.zone === "after" ? (
    <p>{lean.scope}</p>
  ) : (
    <p className="proof__key">Square cards are definitions, round cards theorems and the violet box an axiom; green means it is in Lean, and a dashed line a use in a statement.</p>
  );

  const act = useMemo((): LeanActions => ({ walk: (id) => walk(id), name: (id) => setPoint(id ? { kind: "name", id } : null), plain: plainOf }), [plainOf, walk]);

  const tiedLine = order >= 0 ? `Statement ${order + 1} of ${edition.coverage.ties}` : line.zone === "after" ? "After the last statement" : line.zone === "before" ? "Before the first statement" : `After statement ${reached}`;
  const copy = entry.copy;
  const credit = (
    <p>
      Paper © its authors, <a href={paper.licence_url}>{paper.licence}</a>
      {copy === "reading" ? ". Reading copy retypeset from the PDF, with the same words and the plots cut from it; the layout is ours" : ", with only its blank margins trimmed"}.
      {" "}A program matched {edition.reading ? `all ${edition.reading.words.toLocaleString("en-GB")} words of the reading copy` : "each quotation"} against the authors’ PDF.
      {" "}Lean from the authors’ artifact, built here on Lean {lean.version}. Ties, notes and plain titles were made with AI and have not been reviewed by the authors.
    </p>
  );

  const showRight = wide ? layout.graph || entry.lean : entry.sheet;
  const threadLine = (stepView.exact ?? null)?.[0] ?? declarations.get(stepView.decls[0])?.line ?? null;
  const firstSection = outline.find((e) => e.ties > 0);
  const claimSection = claimPassage ? outline.find((e) => e.number === claimPassage.section) : undefined;

  return (
    <div className="page" data-copy={copy}>
      <a className="skip" href="#the-paper" onClick={(event) => {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-paper-pane]")?.focus();
      }}>Skip to the paper</a>
      <header className={`bar${showRight && wide && edition.reading ? " bar--spread" : ""}`}>
        <div className="bar__left">
          <Lockup />
          {edition.reading && !wide && <button type="button" className="bar__contents" aria-expanded={rail} onClick={() => setRail(!rail)}>Contents</button>}
        </div>
        <div className="bar__column">
          {backButton}
          <div className="stepper" role="group" aria-label="Step through the statements">
            <button type="button" title="The previous statement (k)" onClick={() => step(-1)} disabled={reached === 0 || order === 0}>Previous</button>
            <span>{tiedLine}</span>
            <button type="button" title="The next statement (j)" onClick={() => step(1)} disabled={reached >= edition.passages.length}>Next</button>
          </div>
          {edition.reading && (
            <div className="switch" role="group" aria-label="The left-hand page">
              <button type="button" aria-pressed={copy === "reading"} onClick={() => switchCopy("reading")}>Reading copy</button>
              <button type="button" aria-pressed={copy === "pdf"} onClick={() => switchCopy("pdf")}>PDF</button>
            </div>
          )}
        </div>
        <div className="bar__right">
          <div className="bar__title">
            {copy === "reading" && edition.reading ? <p className="bar__paper">{paper.short_title}</p> : <h1 className="bar__paper">{paper.short_title}</h1>}
          </div>
          {(wide ? !showRight : !entry.sheet) && <button type="button" className="bar__open" onClick={() => (wide ? onLayout({ ...layout, graph: true }) : open({ sheet: true, record: readRoute().record, tab: entry.tab, lean: entry.lean }))}>Graph</button>}
          <button type="button" className="bar__theme" aria-label={scheme === "dark" ? "Use the day theme" : "Use the night theme"} onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}>{scheme === "dark" ? "Day" : "Night"}</button>
          <a className="bar__link" href={paper.url}>Published paper</a>
          <a className="bar__link" href={lean.source}>Lean artifact</a>
        </div>
      </header>
      {entry.bad !== null && (
        <p className="badline" role="alert">
          This address does not name anything in this paper: <code>{entry.bad}</code>. <a href={routeHref({ paper: slug })} onClick={(event) => {
            event.preventDefault();
            jumpTop();
          }}>Go to the start of the paper</a>
        </p>
      )}
      <main className={`spread${edition.reading ? " spread--reading" : ""}${showRight ? " has-right" : ""}`} ref={spread}>
        {edition.reading && (
          <Contents
            outline={edition.reading.outline}
            current={copy === "reading" ? section : outline.find((e) => e.number === passages.get(line.id ?? "")?.section)?.id ?? null}
            open={rail}
            declarations={edition.declarations}
            files={edition.lean.files}
            html={html}
            copy={copy}
            onJump={jumpTo}
            onTop={jumpTop}
            onName={walk}
            onPage={jumpPage}
            onBlock={jumpBlock}
            onIndex={() => onTab("index")}
            onClose={() => setRail(false)}
          />
        )}
        <div className="left" id="the-paper">
          {edition.reading && (html ? (
            <ReadingPane
              ref={reading}
              html={html}
              passages={edition.passages}
              hidden={copy !== "reading"}
              pin={pin}
              lit={litPassages}
              onFollow={onFollow}
              onSection={setSection}
              onSettle={settled}
              onPin={pinPassage}
              onName={(id) => walk(id, "paper")}
              onPage={(page) => switchCopy("pdf", page)}
              onJump={jumpTo}
              onOpenInset={openInset}
              onInsetClosed={saveNow}
              onPoint={onPoint}
              onReady={() => setTick((t) => t + 1)}
              hint={(
                <>
                <p className="firstline firstline--status">The links to Lean and the notes were made with AI and have not been reviewed by the authors.</p>
                <p className="firstline">
                  Statements with a mark beside them open their Lean.
                  {firstSection && <> The first is in <button type="button" onClick={() => jumpTo(firstSection.id)}>{sectionLabel(firstSection.number)}</button></>}
                  {claimSection && <>, the main claim in <button type="button" onClick={() => jumpTo(claimSection.id)}>{sectionLabel(claimSection.number)}</button></>}.
                </p>
                </>
              )}
              foot={<footer className="foot">{credit}<SisterSites /></footer>}
            />
          ) : (
            copy === "reading" && <p className="status" data-paper-pane>Opening the paper…</p>
          ))}
          {pdfSeen && (
            <Suspense fallback={<p className="status" data-paper-pane>Opening the PDF…</p>}>
              <PdfPane
                ref={pdf}
                url={paperFile(slug, "paper.pdf")}
                sizes={paper.sizes}
                crop={paper.crop}
                passages={edition.passages}
                mentions={edition.mentions}
                hidden={copy !== "pdf"}
                pin={pin}
                lit={litPassages}
                onFollow={onFollow}
                onSettle={settled}
                onPin={pinPassage}
                onName={(id) => walk(id, "paper")}
                onPoint={onPoint}
                onReady={() => setTick((t) => t + 1)}
                foot={<footer className="foot">{credit}<SisterSites /></footer>}
              />
            </Suspense>
          )}
        </div>
        {showRight && (
          <ProofPage
            leanOpen={entry.lean}
            onMode={setMode}
            layout={layout}
            onLayout={onLayout}
            caption={<p role="status">{says}</p>}
            reading={readingStrip}
            onClose={wide ? (entry.lean ? undefined : closePage) : closeSheet}
            graph={(
              <MapPane
                ref={map}
                edition={edition}
                graph={graph}
                lit={lit}
                pointed={pointedIds}
                passed={passed}
                reached={reachedDecls}
                selected={pin?.decl ?? null}
                stay={mapStays}
                leanOpen={entry.lean}
                onSelect={openCard}
                onHover={onCardHover}
                onPauseChange={onPauseChange}
              />
            )}
            lean={<LeanPage ref={leanPage} edition={edition} step={stepView} open={entry.lean} tab={entry.tab} onTab={onTab} onPassage={goToPassage} act={act} />}
          />
        )}
        {wide && showRight && <Threads root={spread} target={{ passage: pin?.passage ?? line.id, line: threadLine }} />}
      </main>
    </div>
  );
}

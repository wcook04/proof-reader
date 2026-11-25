// One paper, laid out as an open book: the authors' paper on the left page, read as
// any paper is read, and on the right a page with two modes, Graph and Lean.
//
// Four verbs. Follow: the reading line picks a statement and the right page answers.
// Point: a sentence lights its card in the graph; a card previews its Lean in the dock.
// Open: a click makes something the subject of the right page in the view on show, pushes
// one history entry and gives it an address. Back: the browser's own Back, named on the
// page, which restores everything an entry remembers. Escape and Unpin return to following
// the paper. Only the Graph and Lean buttons change the view (docs/graph-pane.md).

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { blankEntry, newEntryId, pushEntry, readEntry, replaceEntry, returning, type Copy, type Entry, type Pin, type Tab } from "../app/history";
import { declEvidence, hasComparisons, leanOrigin, loadSource, noun, paperFile, passageLocation, type Edition, type Passage } from "../app/edition";
import { LIBRARY_HOME, OwnerLink, ReaderHome, ReaderMark, ReaderMenu, SisterSites } from "../app/Family";
import { readRoute, routeHref } from "../app/router";
import { setScheme, useScheme } from "../app/theme";
import type { LeanActions } from "../lean/code";
import { editionGraph, sectionLabel } from "../model/fromEdition";
import type { LeanPageHandle, Step } from "../proof/LeanPage";
import { MadeLink } from "../proof/MadeLink";
import { clockTime, LONG_FILM, SHORT_FILM } from "../app/films";
import type { MapPaneHandle } from "../proof/MapPane";
import type { PaneMode } from "../proof/ModeToggle";
import { ProofPage, readLayout, saveLayout, type Layout } from "../proof/ProofPage";
import { Contents } from "./Contents";
import { ReadingPane } from "./ReadingPane";
import { Threads } from "./Threads";
import { PaperSplit } from "./PaperSplit";
import { DWELL_MS, type Follow, type PaperHandle, type Pointed, type Target, type Zone } from "./reading-line";

// The paper comes first. The PDF, the map and the Lean page each load when they are wanted.
const PdfPane = lazy(() => import("./PdfPane").then((module) => ({ default: module.PdfPane })));
const leanCode = () => import("../proof/LeanPage").then((module) => ({ default: module.LeanPage }));
const LeanPage = lazy(leanCode);
const MapPane = lazy(() => import("../proof/MapPane").then((module) => ({ default: module.MapPane })));

interface Opened {
  entry: Partial<Entry>;
  target: Target | null;
  bad: string | null;
}

/** Wide enough for the right page to stand beside the paper; narrower, it opens on demand. */
const WIDE = "(min-width: 1280px)";
/** A phone: the right page is a sheet below the paper (the 767px rule in app.css). */
const PHONE = "(max-width: 767px)";

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
    if (edition.passages.some((p) => p.id === at)) return { entry: { pin: { passage: at, decl: null, at: null } }, target: { passage: at }, bad: null };
    const page = /^page-(\d+)$/.exec(at);
    if (page) {
      const n = Number(page[1]);
      if (edition.paper.pdf && n >= 1 && n <= edition.paper.pages) return { entry: { copy: "pdf" }, target: { page: n }, bad: null };
      return { entry: {}, target: { start: true }, bad: record };
    }
    const aliases = edition.reading?.heading_aliases;
    const place = aliases && Object.hasOwn(aliases, at) ? aliases[at] : at;
    return { entry: {}, target: { place }, bad: null };
  }
  const claim = edition.claims.find((c) => c.id === record);
  if (claim) return { entry: { pin: { passage: claim.passage, decl: null, at: null } }, target: { passage: claim.passage }, bad: null };
  if (edition.declarations.some((d) => d.id === record)) {
    const passage = bestPassage(edition, record);
    return { entry: { pin: { passage, decl: record, at: null } }, target: passage ? { passage } : null, bad: null };
  }
  return { entry: {}, target: { start: true }, bad: record };
}

export function PaperPage({ edition }: { edition: Edition }) {
  const slug = edition.slug;
  const { paper, lean } = edition;
  const sourceUrl = paper.url || paperFile(slug, "source.md");
  const hasPdf = !!paper.pdf;
  const markdown = edition.source?.kind === "markdown";
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const declarations = useMemo(() => new Map(edition.declarations.map((d) => [d.id, d])), [edition]);
  const outline = useMemo(() => edition.reading?.outline ?? [], [edition]);
  const homeCopy: Copy = edition.reading ? "reading" : "pdf";
  // A page whose proof is one statement has no graph worth drawing: its right page is the Lean.
  const plain = edition.paper.graph === false;

  const started = useRef<{ entry: Entry; target: Target | null; record: string | undefined } | null>(null);
  if (!started.current) {
    const route = readRoute();
    const retained = readEntry(slug, returning());
    const saved = retained && { ...retained, copy: hasPdf ? retained.copy : "reading" as const };
    const meaning = resolve(edition, route.record, route.extra);
    if (saved) {
      replaceEntry(saved);
      started.current = { entry: saved, target: saved.top !== null ? { top: saved.top, width: saved.width, fallback: meaning.target ?? undefined } : meaning.target, record: route.record };
    } else {
      // A shared address starts in follow. Its subject and address stay exact until reading
      // resumes. On a phone, a statement or declaration also opens the sheet below the paper.
      const { pin, ...view } = meaning.entry;
      const sheet = !!pin && window.matchMedia(PHONE).matches;
      const landing = route.record && !meaning.bad
        ? { passage: pin?.passage ?? undefined, decl: pin?.decl ?? undefined }
        : undefined;
      const entry: Entry = { ...blankEntry(slug, homeCopy), lean: plain || readLayout().lean, ...view, landing, sheet, bad: meaning.bad };
      replaceEntry(entry);
      started.current = { entry, target: meaning.target, record: route.record };
    }
  }

  const [entry, setEntry] = useState<Entry>(started.current.entry);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [html, setHtml] = useState<string | null>(null);
  const [readingFailed, setReadingFailed] = useState(false);
  const [pdfSeen, setPdfSeen] = useState(entry.copy === "pdf");
  const [pdfZoomSlot, setPdfZoomSlot] = useState<HTMLDivElement | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [line, setLine] = useState<{ id: string | null; zone: Zone; above: string | null }>({ id: null, zone: "before", above: null });
  const lastLinked = useRef<string | null>(null);
  const [point, setPoint] = useState<Pointed>(null);
  const [cardPoint, setCardPoint] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [tick, setTick] = useState(0);

  const wide = useMedia(WIDE);
  const phone = useMedia(PHONE);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const onLayout = useCallback((next: Layout) => {
    setLayoutState(next);
    saveLayout(next);
  }, []);
  const scheme = useScheme();

  // The Lean's text and the names on the PDF, once something has asked for them.
  const [source, setSource] = useState<Awaited<ReturnType<typeof loadSource>> | null>(null);
  const sourceAsked = useRef(false);
  const askSource = useCallback(() => {
    if (sourceAsked.current) return;
    sourceAsked.current = true;
    loadSource(slug).then(setSource, () => {
      sourceAsked.current = false;
    });
  }, [slug]);
  const withSource = useMemo(() => (source ? { ...edition, mentions: source.mentions, lean: { ...edition.lean, files: source.files } } : edition), [edition, source]);
  // The Lean is on show in Lean mode and docked under the graph in Graph mode.
  const leanShown = entry.lean || !plain;
  const [leanSeen, setLeanSeen] = useState(leanShown);
  useEffect(() => {
    if (leanShown) setLeanSeen(true);
    if (leanShown || pdfSeen) askSource();
  }, [askSource, leanShown, pdfSeen]);
  // Fetch the Lean while the reader reads, so that the first click answers at once.
  useEffect(() => {
    const later = window.setTimeout(() => {
      askSource();
      void leanCode();
    }, 2500);
    return () => window.clearTimeout(later);
  }, [askSource]);

  const reading = useRef<PaperHandle>(null);
  const pdf = useRef<PaperHandle>(null);
  const map = useRef<MapPaneHandle>(null);
  const leanPage = useRef<LeanPageHandle>(null);
  const pending = useRef<{ target: Target; instant: boolean; insets?: string[]; record?: string } | null>(started.current.target ? { target: started.current.target, instant: true, insets: started.current.entry.insets, record: started.current.record } : null);
  const rightPending = useRef<{ leanTop: number; scene: Entry["scene"]; paused: boolean } | null>(null);
  const leftReading = useRef<{ top: number; width: number; page: number } | null>(null);
  const stepAt = useRef(-1);
  const dwell = useRef(0);
  const cardsQuiet = useRef(0);
  /** Escape went back over opened entries: the view it was pressed in is kept. */
  const keepView = useRef<boolean | null>(null);

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
        if (hasPdf) {
          setPdfSeen(true);
          setEntry((e) => ({ ...e, copy: "pdf" }));
        } else setReadingFailed(true);
      });
    return () => {
      live = false;
    };
  }, [edition, hasPdf, slug]);

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
    if (readEntry(slug)?.id !== entryRef.current.id) return;
    const next = snapshot();
    entryRef.current = next;
    replaceEntry(next);
  }, [slug, snapshot]);

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
    (o: { record?: string; pin?: Pin | null; tab?: Tab; copy?: Copy; target?: Target | null; from?: "paper" | "right"; sheet?: boolean; stay?: boolean; lean?: boolean; wentToLean?: boolean; inspect?: boolean; after?: () => void }) => {
      saveNow();
      o.after?.();
      const cur = entryRef.current;
      const copy = hasPdf ? o.copy ?? cur.copy : "reading";
      const label = o.from === "right" && cur.pin ? (pinLabel(cur.pin) ?? paperLabel()) : paperLabel();
      const next: Entry = {
        ...cur,
        id: newEntryId(),
        copy,
        pin: o.pin === undefined ? cur.pin : o.pin,
        landing: o.record === readRoute().record && !o.pin && !o.target ? cur.landing : undefined,
        tab: o.tab ?? "step",
        top: o.target ? null : cur.top,
        leanTop: 0,
        // Opening something changes the subject, never the view.
        lean: o.lean ?? (plain || cur.lean),
        wentToLean: !!o.wentToLean,
        // Graph hops count back to the reading before the first of them.
        inspect: o.inspect ? { steps: (cur.inspect?.steps ?? 0) + 1, origin: cur.inspect?.origin ?? label } : undefined,
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
      if (copy === "pdf") setPdfSeen(true);
      if (o.target) {
        pending.current = { target: o.target, instant: false, record: o.record };
        setTick((t) => t + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPdf, pane, paperLabel, saveNow, slug, wide],
  );

  /** Follow the address the browser now holds: Back, Forward, or one typed in. */
  const sync = useCallback(() => {
    const route = readRoute();
    if (route.paper !== slug) return;
    // Only the entry the browser itself holds counts here. The copy kept per address is for a
    // reload: used here, an address typed, pasted or linked to that this tab has already passed
    // through would find the page's own entry and go nowhere.
    const retained = readEntry(slug);
    const saved = retained && { ...retained, copy: hasPdf ? retained.copy : "reading" as const };
    const cur = entryRef.current;
    if (saved?.id === cur.id) return;
    const meaning = resolve(edition, route.record, route.extra);
    setPoint(null);
    setCardPoint(null);
    setRail(false);
    const view = keepView.current;
    keepView.current = null;
    if (saved && view !== null && saved.lean !== view) {
      saved.lean = view;
      replaceEntry(saved);
    }
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
  }, [edition, hasPdf, homeCopy, paperLabel, slug, wide]);

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
    // Level statements keep the one in hand, so this is the statement carrying the highlighter.
    if (where.passage) return `@${where.passage}`;
    const block = handle.block();
    return block ? `@${block}` : where.section ? `@${where.section}` : undefined;
  }, [pane]);

  /** The paper stopped: remember the pixel, and keep the address on the nearest sentence. */
  const settled = useCallback((byReader = false) => {
    const handle = pane();
    // A native fragment click can update the address before this page hears hashchange.
    if (!handle || pending.current || readEntry(slug)?.id !== entryRef.current.id) return;
    const cur = snapshot();
    const next = byReader && cur.landing ? { ...cur, landing: undefined } : cur;
    entryRef.current = next;
    if (next !== cur) setEntry(next);
    const href = !next.pin && !next.landing && next.tab === "step" ? routeHref({ paper: slug, record: hereRecord() }) : undefined;
    replaceEntry(next, href);
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
    const next: Entry = { ...entryRef.current, pin: null, landing: undefined, tab: "step", lean, opened: null, wentToLean: false };
    entryRef.current = next;
    setEntry(next);
    settled();
  }, [settled]);

  /** The toggle: the view changes in place and the subject stays. */
  const setMode = useCallback((mode: PaneMode) => {
    if (plain && mode === "graph") return;
    const cur = entryRef.current;
    const lean = mode === "lean";
    chooseMode(lean);
    if (cur.lean === lean) return;
    const next = { ...cur, lean };
    entryRef.current = next;
    setEntry(next);
    replaceEntry(next);
  }, [chooseMode, plain]);

  const closeSheet = useCallback(() => {
    const next = { ...entryRef.current, sheet: false, pin: null, landing: undefined, lean: false };
    entryRef.current = next;
    setEntry(next);
    replaceEntry(next);
  }, []);

  /** Escape and Unpin: back to following the paper, in the view on show. */
  const closeLean = useCallback(() => {
    const cur = entryRef.current;
    if (!cur.pin && !cur.landing?.decl && cur.tab === "step") return;
    if (cur.opened) {
      // Back over the opens, in the view on show.
      keepView.current = cur.lean;
      window.history.go(-cur.opened.steps);
    }
    // An address opened directly on a sheet: close it, where Back from a tapped statement lands.
    else if (cur.sheet && !wide) closeSheet();
    else letGo(plain || cur.lean);
  }, [closeSheet, letGo, plain, wide]);

  const lineId = useRef<string | null>(null);
  const onFollow = useCallback<Follow>((id, zone, above, byReader) => {
    // Reading on lets go of a statement held open: once the reader has scrolled to another
    // statement, the Lean and the graph follow the reading line again.
    const cur = entryRef.current;
    if (byReader && cur.pin && cur.tab === "step" && id && id !== lineId.current && id !== cur.pin.passage) {
      const unpinned = { ...cur, pin: null, opened: null, inspect: undefined };
      entryRef.current = unpinned;
      setEntry(unpinned);
    }
    lineId.current = id;
    if (id && (pane()?.top() ?? 0) > 6) lastLinked.current = id;
    setLine({ id, zone, above });
    const at = id ?? above;
    stepAt.current = at ? edition.passages.findIndex((p) => p.id === at) : -1;
  }, [edition, pane]);

  const pinPassage = useCallback((id: string) => {
    const cur = entryRef.current;
    if (cur.pin?.passage === id && !cur.pin.decl && (wide || cur.sheet)) return;
    // The sheet takes the lower part of a small screen: keep the statement above it.
    const target = !wide && !cur.sheet ? { passage: id } : null;
    // A click changes the subject, not the view.
    open({ record: `@${id}`, pin: { passage: id, decl: null, at: null }, target });
  }, [open, plain, wide]);

  /** A Lean name: the Lean page walks there and the paper stays put. */
  const walk = useCallback((name: string, from: "paper" | "right" = "right") => {
    if (!declarations.has(name)) return;
    if (entryRef.current.pin?.decl === name && entryRef.current.tab === "step") return;
    open({ record: name, pin: { passage: null, decl: name, at: pane()?.top() ?? 0 }, from });
  }, [declarations, open, pane]);

  /** A card: it is inspected in the graph and the Lean, and the paper stays where it is. */
  const openCard = useCallback((id: string) => {
    const decl = edition.claims.find((c) => c.id === id)?.lean[0] ?? id;
    if (!declarations.has(decl) || (entryRef.current.pin?.decl === decl && entryRef.current.tab === "step")) return;
    open({ record: decl, pin: { passage: null, decl, at: pane()?.top() ?? 0 }, from: "right", inspect: true, stay: true });
  }, [declarations, edition, open, pane]);

  /** A sentence named on the Lean page: go there and hold it. */
  const goToPassage = useCallback((id: string) => {
    open({ record: `@${id}`, pin: { passage: id, decl: null, at: null }, target: { passage: id } });
  }, [open]);

  /** From an inspected card to its statement in the paper, which the right page then follows. */
  const followFrom = useCallback((id: string) => {
    stepAt.current = edition.passages.findIndex((p) => p.id === id);
    open({ record: `@${id}`, pin: null, target: { passage: id }, inspect: true });
  }, [edition, open]);

  /** Back over every graph hop, to the reading place and view before the first. */
  const returnToOrigin = useCallback(() => {
    const steps = entryRef.current.inspect?.steps;
    if (steps) window.history.go(-steps);
  }, []);

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
    if (next === "pdf" && !hasPdf) return;
    const cur = entryRef.current;
    if (next === cur.copy && !page) return;
    const handle = pane();
    const where = handle?.where();
    const onPage = page ?? where?.page ?? 1;
    let target: Target = page ? { page } : { page: onPage, into: where?.into };
    if (cur.copy === "reading" && handle) leftReading.current = { top: handle.top(), width: handle.width(), page: onPage };
    if (next === "reading" && leftReading.current?.page === onPage) target = { top: leftReading.current.top, width: leftReading.current.width, fallback: target };
    open({ record: next === "pdf" ? `@page-${onPage}` : `@${where?.section ?? outline.find((e) => e.page !== null && e.page >= onPage)?.id ?? "s-1"}`, copy: next, target, stay: true });
  }, [hasPdf, open, outline, pane]);

  /** A tab of the Lean page. From the dock it stays in the dock; `toLean` is for a control that names the index. */
  const onTab = useCallback((tab: Tab, toLean = false) => {
    if (entryRef.current.tab === tab && (!toLean || entryRef.current.lean)) return;
    const pin = entryRef.current.pin;
    const record = tab === "index" ? "@declarations" : tab === "file" ? "@file" : pin ? (pin.decl ?? `@${pin.passage}`) : hereRecord();
    if (toLean) chooseMode(true);
    open({ record, tab, from: "right", stay: true, lean: toLean ? true : undefined });
  }, [chooseMode, hereRecord, open]);

  /** A reference opens in place. Back closes it, as it undoes any other open. */
  const openInset = useCallback((show: () => void) => {
    const cur = entryRef.current;
    open({ record: readRoute().record, pin: cur.pin, tab: cur.tab, lean: cur.lean, after: show, stay: true });
  }, [open]);

  const step = useCallback((by: number, focusedMark?: HTMLElement) => {
    const list = edition.passages;
    const handle = pane();
    if (!handle || !list.length) return;
    const cur = entryRef.current;
    const pin = cur.pin;
    const heldPassage = pin?.passage ?? cur.landing?.passage;
    const heldAt = heldPassage ? list.findIndex((passage) => passage.id === heldPassage) : -1;
    let at = heldAt < 0 ? stepAt.current : heldAt;
    if (at < 0) at = line.zone === "after" ? list.length : -1;
    const index = Math.max(0, Math.min(list.length - 1, at + by));
    const next = list[index];
    if (!next || index === at) return;
    stepAt.current = index;
    if (pin) {
      open({ record: `@${next.id}`, pin: { passage: next.id, decl: null, at: null }, target: { passage: next.id } });
    } else {
      if (cur.landing) {
        const following = { ...cur, landing: undefined };
        entryRef.current = following;
        setEntry(following);
      }
      setPoint(null);
      handle.place({ passage: next.id });
    }
    if (focusedMark?.matches(":focus")) handle.focusPassage(next.id);
  }, [edition, line.zone, open, pane]);

  const onPoint = useCallback((pointed: Pointed) => setPoint(pointed), []);

  // A card rests under the pointer: preview it after the same dwell as a sentence.
  const onCardHover = useCallback((id: string | null) => {
    window.clearTimeout(dwell.current);
    if (id === null) setCardPoint(null);
    else if (Date.now() < cardsQuiet.current) return;
    else dwell.current = window.setTimeout(() => setCardPoint(id), DWELL_MS);
  }, []);

  const closePage = useCallback(() => onLayout({ ...layoutRef.current, graph: false }), [onLayout]);

  // The keys a reader of a long page reaches for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (event.isComposing || target.closest?.("input, textarea, select, dialog, [contenteditable]")) return;
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
        if (document.querySelector(".reader-menu:popover-open")) return;
        if (pane()?.closeInsets()) return;
        if (rail) return setRail(false);
        if (entryRef.current.sheet && !wide) closeSheet();
        else if (entryRef.current.pin || entryRef.current.lean) closeLean();
        return;
      }
      if (target.closest?.(".tree, [role='separator']")) return;
      const focusedMark = target.matches?.(".q:focus-visible") ? target : undefined;
      if (event.key === "g") {
        setMode(entryRef.current.lean ? "graph" : "lean");
      } else if (event.key === "[") {
        window.history.back();
      } else if (event.key === "]") {
        window.history.forward();
      } else if (event.key === "j" || (!event.shiftKey && event.key === "ArrowRight")) {
        event.preventDefault();
        step(1, focusedMark);
      } else if (event.key === "k" || (!event.shiftKey && event.key === "ArrowLeft")) {
        event.preventDefault();
        step(-1, focusedMark);
      } else if (event.key === "Enter" && !target.closest?.("a, button, summary, [tabindex='0'].q")) {
        const id = pane()?.where().passage;
        if (id) pinPassage(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLean, closeSheet, pane, pinPassage, rail, setMode, step, wide]);

  // ---- What the right page shows --------------------------------------------------

  const { pin, landing } = entry;
  const claimPassage = edition.claims[0] ? passages.get(edition.claims[0].passage) ?? null : null;
  const pointedId = point?.kind === "passage" ? point.id : point?.kind === "name" ? point.passage : undefined;
  const pointedPassage = pointedId && pointedId !== pin?.passage ? passages.get(pointedId) ?? null : null;
  const pointedCard = cardPoint && cardPoint !== pin?.decl && !edition.claims.some((c) => c.id === cardPoint) ? cardPoint : null;
  const pointedClaim = cardPoint ? edition.claims.find((c) => c.id === cardPoint) : undefined;
  const lastTie = edition.passages[edition.passages.length - 1] ?? null;
  const here = useMemo(() => outline.find((e) => e.id === section), [outline, section]);
  const hereLabel = here ? (here.number ? sectionLabel(here.number) : here.title) : null;

  // The front matter: the reading line has reached no linked statement and none lies above it.
  // Until then an opening map stays the whole map, under the camera it opened with.
  const intro = !line.id && !line.above && line.zone === "before";
  type Shown = { mode: "preview" | "next" | "pin" | "line" | "start" | "between" | "after"; passage: Passage | null; decl: string | null };
  // What is in hand, before any preview: the subject of the graph and of the Lean.
  const held = useMemo((): Shown => {
    if (pin?.decl) return { mode: "pin", passage: null, decl: pin.decl };
    if (pin?.passage) return { mode: "pin", passage: passages.get(pin.passage) ?? null, decl: null };
    if (landing?.decl || landing?.passage) return { mode: "line", passage: passages.get(landing.passage ?? "") ?? null, decl: landing.decl ?? null };
    if (intro) return { mode: "start", passage: claimPassage, decl: null };
    if (line.id) return { mode: "line", passage: passages.get(line.id) ?? null, decl: null };
    const previous = lastLinked.current ?? line.above;
    if (previous) return { mode: plain ? "line" : "between", passage: passages.get(previous) ?? null, decl: null };
    return { mode: "start", passage: claimPassage, decl: null };
  }, [claimPassage, intro, landing, line, passages, pin, plain]);
  // In the untied opening of a page that shows no whole map: the statement the next step
  // (→, j or Next) would land on, without moving to it.
  const nextUp = (() => {
    const mapShown = !plain && !entry.lean && (wide ? layout.graph : entry.sheet);
    if (held.mode !== "start" || !intro || mapShown) return null;
    const at = stepAt.current < 0 ? -1 : stepAt.current;
    return edition.passages[at + 1] ?? null;
  })();
  // A card under the pointer previews its Lean, in the dock or in the Lean view. In the Lean
  // view a sentence under the pointer previews its Lean too.
  const shown = useMemo((): Shown => {
    if (pointedCard) return { mode: "preview", passage: null, decl: pointedCard };
    if (pointedClaim) return { mode: "preview", passage: passages.get(pointedClaim.passage) ?? null, decl: null };
    if (entry.lean && pointedPassage) return { mode: "preview", passage: pointedPassage, decl: null };
    if (nextUp) return { mode: "next", passage: nextUp, decl: null };
    return held;
  }, [entry.lean, held, nextUp, passages, pointedCard, pointedClaim, pointedPassage]);

  const stepView = useMemo((): Step => {
    if (shown.mode === "after") return { key: "after", title: null, passage: null, decls: [], exact: null, untied: { section: hereLabel, last: lastTie } };
    if (shown.decl) return { key: `d:${shown.decl}`, title: null, passage: null, decls: [shown.decl], exact: null, untied: null };
    const passage = shown.passage;
    if (!passage) return { key: "none", title: null, passage: null, decls: [], exact: null, untied: { section: hereLabel, last: lastTie } };
    const title = shown.mode === "start" ? `The ${noun(edition)}’s main claim, ${sectionLabel(passage.section)}` : `${shown.mode === "next" ? "Next statement, " : ""}${sectionLabel(passage.section)}, ${passageLocation(passage)}`;
    return { key: `p:${passage.id}`, title, passage, decls: passage.lean, exact: passage.lines ?? null, untied: null };
  }, [hereLabel, lastTie, shown]);

  // The graph's subject: the declarations in hand. Where the paragraph has none, the graph
  // keeps the last ones and says which statement they belong to.
  const heldDecls = useMemo(() => (held.decl ? [held.decl] : held.mode === "after" ? [] : held.passage?.lean ?? []), [held]);
  // After the last statement, the statement before the reading line is the paper's last one.
  const before = held.mode === "after" ? lastTie : held.mode === "between" ? held.passage : null;
  const lastSubject = useRef<string[]>([]);
  if (heldDecls.length) lastSubject.current = heldDecls;
  const graphSubject = heldDecls.length ? heldDecls : before?.lean.length ? before.lean : lastSubject.current;
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
    if (nextUp && !pointedId && !cardPoint) out.add(nextUp.id);
    return out;
  }, [cardPoint, declarations, nextUp, pin, pointedClaim, pointedId, pointedName]);

  // The bar reads the statement in hand; what has been reached is read from the page.
  const activeId = pin?.passage ?? landing?.passage ?? line.id;
  const order = activeId ? edition.passages.findIndex((p) => p.id === activeId) : -1;
  const aboveIndex = line.above ? edition.passages.findIndex((p) => p.id === line.above) : -1;
  const reached = line.zone === "after" ? edition.passages.length : Math.max(aboveIndex + 1, line.id ? edition.passages.findIndex((p) => p.id === line.id) + 1 : 0);
  // Where the reader is, for "read" and "stated later" on the cards.
  const position = order >= 0 ? order : line.zone === "after" ? edition.passages.length : aboveIndex >= 0 ? aboveIndex : -1;

  const back = useCallback(() => window.history.back(), []);

  const placeOf = (p: Passage) => `${sectionLabel(p.section)}, ${passageLocation(p)}`;
  const offMap = held.decl && !(declarations.get(held.decl)?.passages.length);
  const graphLabel = offMap
    ? <>Lean only: the {noun(edition)} does not state this.<button type="button" onClick={() => closeLean()}>Back to this paragraph’s steps</button></>
    : before
      ? <span title={placeOf(before)}>No Lean is linked to this paragraph. This is the statement before it.</span>
      : !heldDecls.length && graphSubject.length
        ? <>No Lean is linked to this paragraph. This is the last statement opened.</>
        : undefined;

  const plainOf = useCallback((id: string | undefined) => (id ? declarations.get(id)?.plain ?? id : ""), [declarations]);
  const name = plainOf(stepView.decls[0]) || stepView.passage?.title;
  const says = (() => {
    if (shown.mode === "preview") return <><b>Previewing</b> {plainOf(shown.decl ?? undefined) || stepView.title}. Move away to return.</>;
    if (shown.mode === "next") return <><b>{edition.paper.standard ? "Before the first linked passage." : "Before the first statement."}</b> Next: {name}, {sectionLabel(shown.passage!.section)}.</>;
    if (shown.mode === "pin") return <><b>Pinned</b> {plainOf(pin?.decl ?? undefined) || stepView.passage?.title || stepView.title}<button type="button" className="proof__unpin" onClick={closeLean}>Unpin</button></>;
    if (shown.mode === "after") {
      const sections = edition.coverage.sections;
      return <><b>{hereLabel ? `No statement in ${hereLabel} is linked to this Lean.` : "No statement here is linked to this Lean."}</b> The linked statements are in {sectionLabel(sections[0])} to {sectionLabel(sections[sections.length - 1])}.</>;
    }
    if (shown.mode === "between") return <><b>No statement at this line.</b> The last was {name}.</>;
    if (shown.mode === "start") return markdown
      ? <><b>Main claim</b> {name}</>
      : edition.paper.standard
        ? <><b>Before the first linked passage,</b> in {sectionLabel(edition.coverage.sections[0])}.</>
        : <><b>Before the first statement,</b> in {sectionLabel(edition.coverage.sections[0])}. Showing the main claim.</>;
    if (offMap) return <b>{name}</b>;
    // The statement by its plain name and section; its exact place is under "In the paper".
    return <><b>Following the {noun(edition)}:</b> {name && shown.passage ? `${name}, ${sectionLabel(shown.passage.section)}` : name || stepView.title}</>;
  })();

  // A card inspected from the graph: its statement in the paper, and the way back to the reading.
  const inspectedPassage = entry.inspect && pin?.decl ? bestPassage(edition, pin.decl) : null;
  // Before landing the card offers its passage; once there, or with none, the way back.
  const backButton = inspectedPassage ? (
    <button type="button" className="back" onClick={() => followFrom(inspectedPassage)} title={`Go to ${placeOf(passages.get(inspectedPassage)!)} and follow the ${noun(edition)} from there`}>Go to passage</button>
  ) : entry.inspect ? (
    <button type="button" className="back" onClick={returnToOrigin} title={`Back to ${entry.inspect.origin}, as it was before the first click in the graph`}>Return to original</button>
  ) : entry.back && <button type="button" className="back" onClick={back} title="Your browser’s Back ( [ or Alt + Left )">Back to {entry.back}</button>;

  const pointedDecl = pointedName ? declarations.get(pointedName) : null;
  const hasLean = (ids: string[]) => ids.map((id) => declarations.get(id)).filter((d) => !!d);
  const named = hasLean(pointedCard ? [pointedCard] : pointedPassage?.lean ?? pointedClaim?.lean ?? []);
  const readingStrip = pointedDecl ? (
    <p><b>{pointedDecl.plain}.</b> <code className="proof__sig">{pointedDecl.id} : {pointedDecl.type}</code></p>
  ) : point?.kind === "text" ? (
    <p><b>{point.title}.</b> {point.text}</p>
  ) : named.length ? (
    <p><b>{named.map((d) => d.plain).join(", ")}</b> <code className="proof__sig">{named.map((d) => d.id).join(", ")}</code>. Has Lean, {named.map((d) => `lines ${d.line} to ${d.end_line}`).join(", ")}. Click to read it.</p>
  ) : entry.lean || !plain ? null : line.zone === "after" ? (
    <p>{lean.scope}</p>
  ) : (
    <p className="proof__key">
      Square cards are definitions, round cards theorems{edition.analytics.axioms.length ? " and the violet box an axiom" : ""}.
      {" "}A line runs down from a declaration to one it uses: dashed when only its statement uses it, solid when its proof or definition body does.
      {edition.declarations.some((d) => declEvidence(edition, d) !== "lean") && <> <strong>Open a card to see what was extracted for that declaration.</strong></>}
    </p>
  );

  const act = useMemo((): LeanActions => ({ walk: (id) => walk(id), name: (id) => setPoint(id ? { kind: "name", id } : null), plain: plainOf }), [plainOf, walk]);

  const tiedLine = order >= 0 ? `Statement ${order + 1} of ${edition.coverage.ties}` : line.zone === "after" ? "After the last statement" : line.zone === "before" ? "Before the first statement" : `After statement ${reached}`;
  const copy = entry.copy;
  const credit = markdown ? (
    <p>
      {edition.credit?.text ?? `Text: ${paper.authors.join(", ")}, ${paper.licence}`}.
      {" "}<a href={sourceUrl}>Source Markdown</a>. <MadeLink onOpen={() => onTab("index", true)} />.
    </p>
  ) : (
    <p>
      Paper © its authors, <a href={paper.licence_url}>{paper.licence}</a>
      {copy === "reading" ? ". Reading copy retypeset from the PDF, with its figures copied from the PDF; the layout is ours" : ", with only its blank margins trimmed"}.
      {" "}{edition.reading
        ? "A program checked the reading copy against text extracted from the PDF. The check omits margins and figures and can miss changes in text order. Use the original PDF to verify the wording."
        : "Each linked quotation was found in text extracted from the authors’ PDF."}
      {" "}{leanOrigin(edition)} Links, notes, plain titles{hasComparisons(edition) ? " and comparisons" : ""} were made with AI and have not been reviewed by the authors. <MadeLink onOpen={() => onTab("index", true)} />.
    </p>
  );

  const showRight = wide ? layout.graph || entry.lean : entry.sheet;
  const threadLine = (stepView.exact ?? null)?.[0] ?? declarations.get(stepView.decls[0])?.line ?? null;

  const readingControls = (<>
    {backButton}
    <div className="stepper" role="group" aria-label="Step through the statements">
      <button type="button" title="The previous statement (k)" onClick={() => step(-1)} disabled={reached === 0 || order === 0}>Previous</button>
      <span>{tiedLine}</span>
      <button type="button" title="The next statement (j)" onClick={() => step(1)} disabled={reached >= edition.passages.length}>Next</button>
    </div>
    {hasPdf && (
      <div className="bar__copy-tools">
        {edition.reading && (
          <div className="switch" role="group" aria-label="The left-hand page">
            <button type="button" aria-pressed={copy === "reading"} onClick={() => switchCopy("reading")}>Reading copy</button>
            <button type="button" aria-pressed={copy === "pdf"} onClick={() => switchCopy("pdf")}>PDF</button>
          </div>
        )}
        {copy === "pdf" && <div ref={setPdfZoomSlot} />}
      </div>
    )}
  </>);

  return (
    <div className="page" data-copy={copy}>
      <a className="skip" href="#the-paper" onClick={(event) => {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-paper-pane]")?.focus();
      }}>Skip to the paper</a>
      <header className={`bar bar--reader${showRight && wide && edition.reading ? " bar--spread" : ""}`}>
        <div className="bar__left">
          <ReaderHome />
        </div>
        {!phone && <div className="bar__column">{copy === "reading" && readingControls}</div>}
        <div className="bar__right">
          <a className="bar__title" href={LIBRARY_HOME}>
            <ReaderMark paper={slug} />
            {copy === "reading" && edition.reading ? <p className="bar__paper">{paper.short_title}</p> : <h1 className="bar__paper">{paper.short_title}</h1>}
          </a>
          {(wide ? !showRight : !entry.sheet) && <button type="button" className="bar__open" onClick={() => (wide ? onLayout({ ...layout, graph: true }) : open({ sheet: true, record: readRoute().record, tab: entry.tab, lean: plain || entry.lean }))}>{plain ? "Lean" : "Graph"}</button>}
          <ReaderMenu onOpen={() => setRail(false)}>
            {edition.reading && <button type="button" onClick={() => {
              setRail(true);
              requestAnimationFrame(() => document.querySelector<HTMLElement>(".rail__search input")?.focus());
            }}>Search the {noun(edition)}</button>}
            {edition.reading && !wide && <button type="button" onClick={() => setRail(true)}>Contents</button>}
            {phone && copy === "reading" && <div className="reader-menu__mobile">{readingControls}</div>}
            <a href={routeHref({})}>All editions</a>
            {!!edition.sheets?.length && <a href={routeHref({ paper: slug, record: "@sheet" })}>Statement sheet</a>}
            {edition.evaluation && <button type="button" onClick={() => onTab("index", true)}>Results</button>}
            <a href={sourceUrl}>{markdown ? "Source Markdown" : "Published paper"}</a>
            <a href={lean.source}>Lean artifact</a>
            {paper.films && <>
              <a className="bar__film" href={SHORT_FILM.youtube} target="_blank" rel="noopener noreferrer">{SHORT_FILM.title}, {clockTime(SHORT_FILM.seconds)}</a>
              <a className="bar__film" href={LONG_FILM.youtube} target="_blank" rel="noopener noreferrer">{LONG_FILM.title}, {clockTime(LONG_FILM.seconds)}</a>
            </>}
            <button type="button" className="bar__theme" onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}>{scheme === "dark" ? "Use the day theme" : "Use the night theme"}</button>
          </ReaderMenu>
          <OwnerLink />
        </div>
      </header>
      {copy === "pdf" && <div className="bar__pdf-controls">{readingControls}</div>}
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
            noun={noun(edition)}
            outline={edition.reading.outline}
            current={copy === "reading" ? section : outline.find((e) => e.number === passages.get(line.id ?? "")?.section)?.id ?? null}
            open={rail}
            declarations={edition.declarations}
            files={withSource.lean.files}
            html={html}
            copy={copy}
            onJump={jumpTo}
            onTop={jumpTop}
            onName={walk}
            onPage={jumpPage}
            onBlock={jumpBlock}
            onIndex={() => onTab("index", true)}
            onClose={() => setRail(false)}
            onSearch={askSource}
          />
        )}
        <div className="left" id="the-paper">
          {edition.reading && (html ? (
            <ReadingPane
              ref={reading}
              slug={slug}
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
              onLeave={saveNow}
              onOpenInset={openInset}
              onInsetClosed={saveNow}
              onPoint={onPoint}
              onReady={() => setTick((t) => t + 1)}
              hint={markdown ? null : (
                <p className="firstline firstline--status">{hasComparisons(edition)
                  ? `The links from this ${noun(edition)} to its proof in Lean, the notes and the comparisons were made with AI`
                  : `The links from this ${noun(edition)} to its proof in Lean, and the notes, were made with AI`} and have not been reviewed by the authors.</p>
              )}
              foot={<footer className="foot">{credit}<SisterSites /></footer>}
            />
          ) : (
            copy === "reading" && <p className="status" data-paper-pane role={readingFailed ? "alert" : undefined}>{readingFailed ? <>Could not open the {noun(edition)}. <a href={sourceUrl}>Read the source Markdown</a>.</> : `Opening the ${noun(edition)}…`}</p>
          ))}
          {hasPdf && paper.crop && pdfSeen && (
            <Suspense fallback={<p className="status" data-paper-pane>Opening the PDF…</p>}>
              <PdfPane
                ref={pdf}
                url={paperFile(slug, "paper.pdf")}
                sizes={paper.sizes}
                crop={paper.crop}
                passages={edition.passages}
                mentions={withSource.mentions}
                hidden={copy !== "pdf"}
                zoomSlot={pdfZoomSlot}
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
            plain={plain}
            onMode={setMode}
            layout={layout}
            onLayout={onLayout}
            caption={<p role="status">{says}</p>}
            reading={readingStrip}
            onClose={wide ? (entry.lean ? undefined : closePage) : closeSheet}
            graph={(availableHeight, onFitHeight) => (
              <Suspense fallback={null}>
              <MapPane
                ref={map}
                edition={edition}
                graph={graph}
                subjects={graphSubject}
                autoOverview={intro && !pin && !landing?.passage && !landing?.decl}
                pointed={pointedIds}
                held={pointedCard}
                position={position}
                label={graphLabel}
                onSubject={openCard}
                onHover={onCardHover}
                availableHeight={availableHeight}
                onFitHeight={onFitHeight}
              />
              </Suspense>
            )}
            lean={leanSeen && source && (
              <Suspense fallback={null}>
                <LeanPage ref={leanPage} edition={withSource} step={stepView} open={leanShown && !!showRight} startTop={entry.leanTop} tab={entry.tab} onTab={onTab} onPassage={goToPassage} act={act} onOpenLean={entry.lean || plain ? undefined : () => setMode("lean")} />
              </Suspense>
            )}
          />
        )}
        {wide && showRight && edition.reading && <PaperSplit />}
        {wide && showRight && <Threads root={spread} target={{ passage: activeId, line: threadLine }} />}
      </main>
    </div>
  );
}

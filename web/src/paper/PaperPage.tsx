// One paper, laid out as an open book: the authors' paper on the left page and the
// proof on the right, the graph above and the Lean below.
//
// Four verbs. Follow: the reading line picks a statement and the right page answers.
// Point: a dwell previews on the right page and leaving restores it. Open: a click
// holds a thing, pushes one history entry and gives it an address. Back: the browser's
// own Back, named on the page, which restores everything an entry remembers.

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { blankEntry, newEntryId, pushEntry, readEntry, replaceEntry, type Copy, type Entry, type Pin, type Tab } from "../app/history";
import { paperFile, type Edition, type Passage } from "../app/edition";
import { readRoute, routeHref } from "../app/router";
import { setScheme, useScheme } from "../app/theme";
import type { LeanActions } from "../lean/code";
import { editionGraph, sectionLabel } from "../model/fromEdition";
import { LeanPage, type LeanPageHandle, type Step } from "../proof/LeanPage";
import { MapPane, type MapPaneHandle } from "../proof/MapPane";
import { ProofPage } from "../proof/ProofPage";
import { Contents } from "./Contents";
import { ReadingPane } from "./ReadingPane";
import { DWELL_MS, type PaperHandle, type Pointed, type Target, type Zone } from "./reading-line";

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
  if (record === "@declarations") return { entry: { tab: "index" }, target: null, bad: null };
  if (record === "@file") return { entry: { tab: "file" }, target: null, bad: null };
  if (record.startsWith("@")) {
    const at = record.slice(1);
    if (edition.passages.some((p) => p.id === at)) return { entry: {}, target: { passage: at }, bad: null };
    const page = /^page-(\d+)$/.exec(at);
    if (page) {
      const n = Number(page[1]);
      if (n >= 1 && n <= edition.paper.pages) return { entry: { copy: "pdf" }, target: { page: n }, bad: null };
      return { entry: {}, target: { start: true }, bad: record };
    }
    return { entry: {}, target: { place: at }, bad: null };
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
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const declarations = useMemo(() => new Map(edition.declarations.map((d) => [d.id, d])), [edition]);
  const outline = useMemo(() => edition.reading?.outline ?? [], [edition]);
  const homeCopy: Copy = edition.reading ? "reading" : "pdf";

  const started = useRef<{ entry: Entry; target: Target | null; record: string | undefined } | null>(null);
  if (!started.current) {
    const route = readRoute();
    const saved = readEntry(slug);
    const meaning = resolve(edition, route.record, route.extra);
    if (saved) {
      started.current = { entry: saved, target: saved.top !== null ? { top: saved.top, width: saved.width, fallback: meaning.target ?? undefined } : meaning.target, record: route.record };
    } else {
      const entry: Entry = { ...blankEntry(slug, homeCopy), ...meaning.entry, bad: meaning.bad };
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
  const [line, setLine] = useState<{ id: string | null; zone: Zone }>({ id: null, zone: "before" });
  const [point, setPoint] = useState<Pointed>(null);
  const [cardPoint, setCardPoint] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [mapStays, setMapStays] = useState(false);
  const [tick, setTick] = useState(0);

  const wide = useMedia("(min-width: 1280px)");
  const phone = useMedia("(max-width: 767px)");
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
    return heading ? (heading.number ? sectionLabel(heading.number) : heading.title) : "the start of the paper";
  }, [outline, pane]);

  const pinLabel = (pin: Pin) => pin.decl ?? passages.get(pin.passage ?? "")?.lean[0] ?? null;

  /** Open something: one history entry, with an address and a way back. */
  const open = useCallback(
    (o: { record?: string; pin?: Pin | null; tab?: Tab; copy?: Copy; target?: Target | null; from?: "paper" | "right"; sheet?: boolean; stay?: boolean }) => {
      saveNow();
      const cur = entryRef.current;
      const copy = o.copy ?? cur.copy;
      const label = o.from === "right" && cur.pin ? (pinLabel(cur.pin) ?? paperLabel()) : paperLabel();
      if (copy === "reading" && cur.copy === "pdf") leftReading.current = leftReading.current;
      const next: Entry = {
        ...cur,
        id: newEntryId(),
        copy,
        pin: o.pin === undefined ? cur.pin : o.pin,
        tab: o.tab ?? "step",
        top: o.target ? null : cur.top,
        leanTop: 0,
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
      setMapStays(!!o.stay);
      if (copy === "pdf") setPdfSeen(true);
      if (o.target) {
        pending.current = { target: o.target, instant: false, record: o.record };
        setTick((t) => t + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paperLabel, saveNow, slug, wide],
  );

  /** Follow the address the browser now holds: Back, Forward, or one typed in. */
  const sync = useCallback(() => {
    const route = readRoute();
    if (route.paper !== slug) return;
    const saved = readEntry(slug);
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

  /** The paper stopped: remember the pixel, and keep the address on the nearest sentence. */
  const settled = useCallback(() => {
    const handle = pane();
    if (!handle || pending.current) return;
    const cur = snapshot();
    entryRef.current = cur;
    let href: string | undefined;
    if (!cur.pin && cur.tab === "step") {
      const where = handle.where();
      const record = cur.copy === "pdf" ? `@page-${where.page}` : handle.top() < 4 ? undefined : where.passage ? `@${where.passage}` : where.section ? `@${where.section}` : undefined;
      href = routeHref({ paper: slug, record });
    }
    replaceEntry(cur, href);
  }, [pane, slug, snapshot]);

  const release = useCallback(() => {
    if (!entryRef.current.pin) return;
    const next = { ...entryRef.current, pin: null };
    entryRef.current = next;
    setEntry(next);
    setMapStays(false);
    settled();
  }, [settled]);

  const onFollow = useCallback((id: string | null, zone: Zone) => {
    setLine({ id, zone });
    if (id) {
      lastPassage.current = id;
      stepAt.current = edition.passages.findIndex((p) => p.id === id);
    }
  }, [edition]);

  const pinPassage = useCallback((id: string) => {
    const cur = entryRef.current;
    if (cur.pin?.passage === id && !cur.pin.decl) return;
    open({ record: `@${id}`, pin: { passage: id, decl: null, at: null } });
  }, [open]);

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
    open({ record: tab === "index" ? "@declarations" : tab === "file" ? "@file" : undefined, tab, from: "right", stay: true });
  }, [open]);

  const onPinLeft = release;

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
      const unpinned = { ...entryRef.current, pin: null };
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
    else dwell.current = window.setTimeout(() => setCardPoint(id), DWELL_MS);
  }, []);

  const onPauseChange = useCallback((paused: boolean) => {
    if (!paused) setMapStays(false);
  }, []);

  const closeSheet = useCallback(() => {
    const next = { ...entryRef.current, sheet: false, pin: null };
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
        if (entryRef.current.pin) release();
        else if (entryRef.current.sheet && !wide) closeSheet();
        return;
      }
      if (target.closest?.(".tree, [role='separator']")) return;
      if (event.key === "[") {
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
  }, [closeSheet, pane, pinPassage, rail, release, step, wide]);

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
    if (pointedPassage) return { mode: "preview", passage: pointedPassage, decl: null };
    if (pointedCard) return { mode: "preview", passage: null, decl: pointedCard };
    if (pointedClaim) return { mode: "preview", passage: passages.get(pointedClaim.passage) ?? null, decl: null };
    if (pin?.decl) return { mode: "pin", passage: null, decl: pin.decl };
    if (pin?.passage) return { mode: "pin", passage: passages.get(pin.passage) ?? null, decl: null };
    if (line.id) return { mode: "line", passage: passages.get(line.id) ?? null, decl: null };
    if (line.zone === "after") return { mode: "after", passage: null, decl: null };
    if (line.zone === "between" && lastPassage.current) return { mode: "between", passage: passages.get(lastPassage.current) ?? null, decl: null };
    return { mode: "start", passage: claimPassage, decl: null };
  }, [claimPassage, line, passages, pin, pointedCard, pointedClaim, pointedPassage]);

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
  const pointedIds = useMemo(() => (pointedName ? new Set([pointedName]) : null), [pointedName]);

  // Every statement tied to what is held or pointed at takes the soft wash.
  const litPassages = useMemo(() => {
    const out = new Set<string>();
    const ids = pointedName ? [pointedName] : cardPoint ? [cardPoint] : pin?.decl ? [pin.decl] : [];
    for (const id of ids) for (const p of declarations.get(id)?.passages ?? []) out.add(p);
    if (pointedClaim) out.add(pointedClaim.passage);
    return out;
  }, [cardPoint, declarations, pin, pointedClaim, pointedName]);

  const order = line.id ? edition.passages.findIndex((p) => p.id === line.id) : -1;
  const reached = line.zone === "after" ? edition.passages.length : order >= 0 ? order + 1 : Math.max(0, stepAt.current + 1);
  const passed = useMemo(() => {
    const out = new Set<string>();
    edition.passages.slice(0, Math.max(0, reached - 1)).forEach((p) => p.lean.forEach((id) => out.add(id)));
    return out;
  }, [edition, reached]);
  const reachedDecls = useMemo(() => new Set([...passed, ...lit]).size, [lit, passed]);

  const unpinOne = useCallback(() => release(), [release]);
  const back = useCallback(() => window.history.back(), []);
  const firstTie = edition.coverage.sections[0];
  const lastSection = edition.coverage.sections[edition.coverage.sections.length - 1];

  const name = stepView.decls[0];
  const says = (() => {
    if (shown.mode === "preview") return <><b>Previewing</b> {shown.decl ?? stepView.title}. Move away to return.</>;
    if (shown.mode === "pin") return <><b>Pinned</b> {pin?.decl ?? stepView.title}<button type="button" className="proof__unpin" onClick={unpinOne}>Unpin</button></>;
    if (shown.mode === "after") return <><b>No ties here.</b> They stop at the end of {sectionLabel(lastSection)}, statement {edition.coverage.ties} of {edition.coverage.ties}.</>;
    if (shown.mode === "between") return <><b>No tie at this line.</b> Still showing the last one, {name}.</>;
    if (shown.mode === "start") return <><b>Before the first tie,</b> which is in {sectionLabel(firstTie)}. Showing the main claim.</>;
    return <><b>Following the paper:</b> {stepView.title}, statement {order + 1} of {edition.coverage.ties}</>;
  })();

  const backButton = entry.back && <button type="button" className="back" onClick={back} title="Your browser’s Back ( [ or Alt + Left )">Back to {entry.back}</button>;

  const pointedDecl = pointedName ? declarations.get(pointedName) : null;
  const readingStrip = pointedDecl ? (
    <p><code className="proof__sig">{pointedDecl.id} : {pointedDecl.type}</code></p>
  ) : point?.kind === "text" ? (
    <p><b>{point.title}.</b> {point.text}</p>
  ) : (
    <p className="proof__readinghint">Point at a Lean name or a reference to read it here.</p>
  );

  const act = useMemo((): LeanActions => ({ walk: (id) => walk(id), name: (id) => setPoint(id ? { kind: "name", id } : null) }), [walk]);

  const tiedLine = line.zone === "after" ? "After the last tie" : line.zone === "before" ? "Before the first tie" : line.zone === "between" ? "Between ties" : `Statement ${order + 1} of ${edition.coverage.ties}`;
  const copy = entry.copy;
  const credit = (
    <p>
      Paper © its authors, <a href={paper.licence_url}>{paper.licence}</a>
      {copy === "reading" ? ". Reading copy retypeset from the PDF, with the same words and the plots cut from it; the layout is ours" : ", with only its blank margins trimmed"}.
      {" "}Lean from the authors’ artifact, built here on Lean {lean.version}. Ties and notes were made with AI and have not been reviewed by the authors.
    </p>
  );

  const showRight = wide || entry.sheet;
  const firstSection = outline.find((e) => e.ties > 0);
  const claimSection = claimPassage ? outline.find((e) => e.number === claimPassage.section) : undefined;

  return (
    <div className="page" data-copy={copy}>
      <a className="skip" href={routeHref({ paper: slug })} onClick={(event) => {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-paper-pane]")?.focus();
      }}>Skip to the paper</a>
      <header className="bar">
        <a className="bar__home" href={routeHref({})} aria-label="Proof Reader, all papers">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={22} height={22} />
          <span className="bar__name">Proof Reader</span>
        </a>
        <div className="bar__title">
          <h1 className="bar__paper">{paper.short_title}</h1>
          {hereLabel && copy === "reading" && <p className="bar__where">{hereLabel}{here?.number ? ` ${here.title}` : ""}</p>}
        </div>
        {edition.reading && !wide && <button type="button" className="bar__contents" aria-expanded={rail} onClick={() => setRail(!rail)}>Contents</button>}
        {backButton}
        <div className="stepper" role="group" aria-label="Step through the statements tied to the Lean">
          <button type="button" title="The previous tied statement (k)" onClick={() => step(-1)} disabled={reached <= 1}>Previous</button>
          <span>{tiedLine}</span>
          <button type="button" title="The next tied statement (j)" onClick={() => step(1)} disabled={line.zone === "after" || reached >= edition.passages.length}>Next</button>
        </div>
        {edition.reading && (
          <div className="switch" role="group" aria-label="The left-hand page">
            <button type="button" aria-pressed={copy === "reading"} onClick={() => switchCopy("reading")}>Reading copy</button>
            <button type="button" aria-pressed={copy === "pdf"} onClick={() => switchCopy("pdf")}>PDF</button>
          </div>
        )}
        {!wide && !entry.sheet && <button type="button" className="bar__open" onClick={() => open({ sheet: true, record: pin?.decl ?? undefined })}>Lean</button>}
        <button type="button" className="bar__theme" aria-label={scheme === "dark" ? "Use the day theme" : "Use the night theme"} onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}>{scheme === "dark" ? "Day" : "Night"}</button>
        <a className="bar__link" href={paper.url}>Published paper</a>
        <a className="bar__link" href={lean.source}>Lean artifact</a>
      </header>
      {entry.bad !== null && (
        <p className="badline" role="alert">
          This address does not name anything in this paper: <code>{entry.bad}</code>. <a href={routeHref({ paper: slug })} onClick={(event) => {
            event.preventDefault();
            jumpTop();
          }}>Go to the start of the paper</a>
        </p>
      )}
      <main className={`spread${edition.reading ? " spread--reading" : ""}${showRight ? " has-right" : ""}`}>
        {edition.reading && (
          <Contents
            outline={edition.reading.outline}
            current={copy === "reading" ? section : outline.find((e) => e.number === shown.passage?.section)?.id ?? null}
            words={edition.reading.words}
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
        <div className="left">
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
              onPoint={onPoint}
              onPinLeft={onPinLeft}
              onReady={() => setTick((t) => t + 1)}
              hint={(
                <p className="firstline">
                  Click any marked statement to see its Lean.
                  {firstSection && <> The first is in <button type="button" onClick={() => jumpTo(firstSection.id)}>{sectionLabel(firstSection.number)}</button></>}
                  {claimSection && <>, the main claim in <button type="button" onClick={() => jumpTo(claimSection.id)}>{sectionLabel(claimSection.number)}</button></>}.
                </p>
              )}
              foot={<footer className="foot">{credit}</footer>}
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
                onPinLeft={onPinLeft}
                onReady={() => setTick((t) => t + 1)}
              />
            </Suspense>
          )}
        </div>
        {showRight && (
          <ProofPage
            phone={phone}
            caption={<>{entry.back && <button type="button" className="back back--right" onClick={back}>Back to {entry.back}</button>}<p role="status">{says}</p></>}
            reading={readingStrip}
            onClose={wide ? undefined : closeSheet}
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
                onSelect={openCard}
                onHover={onCardHover}
                onPauseChange={onPauseChange}
              />
            )}
            lean={<LeanPage ref={leanPage} edition={edition} step={stepView} tab={entry.tab} onTab={onTab} onPassage={goToPassage} act={act} />}
          />
        )}
      </main>
    </div>
  );
}

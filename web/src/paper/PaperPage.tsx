// One paper, laid out as an open book: the authors' paper on the left page and
// their Lean on the right, with each sentence level with the Lean it describes.
// The left page is the paper set for reading, or the PDF itself. Scroll the
// paper and the Lean follows; click anything and the other side goes there. The
// map of the proof takes the right-hand page when asked for.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArgumentTree, type Insets, type MapViewHandle } from "../map/ArgumentTree";
import { editionGraph, isType } from "../model/fromEdition";
import { paperFile, type Edition } from "../app/edition";
import { routeHref } from "../app/router";
import { LeanPane } from "../lean/LeanPane";
import { Contents } from "./Contents";
import { ReadingPane } from "./ReadingPane";
import type { PaperHandle } from "./reading-line";
import { Threads } from "./Threads";

const PdfPane = lazy(() => import("./PdfPane").then((module) => ({ default: module.PdfPane })));

const INSETS: Insets = { top: 22, right: 22, bottom: 22, left: 22 };
type View = "lean" | "map";
type Copy = "reading" | "pdf";

function list(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function PaperPage({ edition, record }: { edition: Edition; record?: string }) {
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const spread = useRef<HTMLElement>(null);
  const pdf = useRef<PaperHandle>(null);
  // An address names a declaration, or with @ a place in the paper.
  const at_ = record?.startsWith("@") ? record.slice(1) : null;
  const addressed = at_ !== null && edition.passages.some((p) => p.id === at_) ? at_ : null;
  const place = addressed ? null : at_;
  const named = at_ !== null ? undefined : record;
  const [copy, setCopy] = useState<Copy>(edition.reading && !place?.startsWith("page-") ? "reading" : "pdf");
  const [html, setHtml] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [pdfPage, setPdfPage] = useState(place?.startsWith("page-") ? place : null);

  useEffect(() => {
    if (!edition.reading) return;
    let live = true;
    fetch(paperFile(edition.slug, "reading.html"))
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => live && setHtml(text), () => live && setCopy("pdf"));
    return () => {
      live = false;
    };
  }, [edition]);
  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const declarations = useMemo(() => new Map(edition.declarations.map((d) => [d.id, d])), [edition]);

  const firstPassage = useCallback(
    (id: string) => declarations.get(id)?.passages[0] ?? edition.claims.find((c) => c.id === id)?.passage ?? null,
    [declarations, edition],
  );
  const start = addressed ?? (named ? firstPassage(named) : null) ?? edition.claims[0]?.passage ?? edition.passages[0]?.id ?? null;
  const opening = useRef(start);

  const [active, setActive] = useState<string | null>(start);
  const [pinned, setPinned] = useState<string | null>(named ?? null);
  const [axiom, setAxiom] = useState<string | null>(null);
  const [view, setView] = useState<View>("lean");
  const [fromMap, setFromMap] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const activePassage = active ? passages.get(active) : undefined;
  const reading = useMemo(() => activePassage?.lean ?? [], [activePassage]);
  const exact = activePassage?.lines ?? null;
  // Past the last tie on a page the Lean stays where it was, so it never jumps.
  const held = useRef<string | null>(null);
  const selected = pinned ?? reading[0] ?? held.current;
  held.current = selected;
  const order = active ? edition.passages.findIndex((p) => p.id === active) : -1;
  const at = useRef(0);
  if (order >= 0) at.current = order;

  const litIds = useMemo(() => {
    if (axiom) return new Set([axiom, ...(edition.analytics.resting_on_axioms[axiom] ?? [])]);
    return new Set(pinned ? [pinned] : reading);
  }, [axiom, edition, pinned, reading]);

  const litPassages = useMemo(() => {
    const out = new Set<string>();
    for (const id of litIds) for (const p of declarations.get(id)?.passages ?? []) out.add(p);
    return out;
  }, [declarations, litIds]);

  const choose = useCallback(
    (id: string | null) => {
      setAxiom(null);
      setPinned(id);
      if (!id) return;
      window.history.replaceState(null, "", routeHref({ paper: edition.slug, record: id }));
      const first = firstPassage(id);
      if (first) {
        setActive(first);
        pdf.current?.scrollToPassage(first);
      }
    },
    [edition, firstPassage],
  );

  const pickPassage = useCallback(
    (id: string) => {
      setAxiom(null);
      setActive(id);
      setPinned(passages.get(id)?.lean[0] ?? null);
      // The address now opens on this sentence, so it can be sent to someone.
      window.history.replaceState(null, "", routeHref({ paper: edition.slug, record: `@${id}` }));
    },
    [edition, passages],
  );

  /** A name clicked in the paper: open its Lean and leave the reader's place alone. */
  const pickName = useCallback((name: string) => {
    setAxiom(null);
    setActive(null);
    setPinned(name);
    setView("lean");
    setFromMap(false);
  }, []);

  /** A card clicked on the map: turn to its Lean, with a way back. */
  const openFromMap = useCallback(
    (id: string | null) => {
      choose(id);
      if (id && declarations.has(id)) {
        setView("lean");
        setFromMap(true);
      }
    },
    [choose, declarations],
  );

  const show = (next: View) => {
    setView(next);
    setFromMap(false);
  };

  const switchCopy = useCallback(
    (next: Copy, page: string | null = null) => {
      opening.current = activeRef.current ?? opening.current;
      setPdfPage(page);
      setCopy(next);
    },
    [],
  );

  const onJump = useCallback(
    (from: string | null) => {
      const entry = edition.reading?.outline.find((e) => e.id === from);
      setBack(entry ? (entry.number ? `section ${entry.number}` : entry.title) : "where you were");
    },
    [edition],
  );

  const jumpBack = useCallback(() => {
    pdf.current?.back?.();
    setBack(null);
  }, []);

  const jumpTo = useCallback((id: string) => {
    setRail(false);
    pdf.current?.scrollToPlace?.(id);
  }, []);

  const jumpTop = useCallback(() => {
    setRail(false);
    pdf.current?.toTop?.();
  }, []);

  const toPdfPage = useCallback((page: number) => switchCopy("pdf", `page-${page}`), [switchCopy]);

  const toPassage = useCallback((id: string) => {
    setActive(id);
    pdf.current?.scrollToPassage(id);
  }, []);

  const step = useCallback(
    (by: number) => {
      // Between ties, Previous goes back to the last one passed.
      const onTie = edition.passages.some((p) => p.id === activeRef.current);
      const next = edition.passages[Math.max(0, Math.min(edition.passages.length - 1, at.current + (onTie || by > 0 ? by : 0)))];
      if (!next) return;
      setPinned(null);
      setAxiom(null);
      setActive(next.id);
      pdf.current?.scrollToPassage(next.id);
    },
    [edition],
  );

  // The left and right arrows walk through the links.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest?.("input, textarea, .map-canvas")) return;
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const release = useCallback(() => {
    setPinned(null);
    setAxiom(null);
  }, []);

  const { paper, lean } = edition;
  const focus = selected ? declarations.get(selected) : undefined;
  const credit = (
    <p>
      Paper © its authors, <a href={paper.licence_url}>{paper.licence}</a>
      {copy === "reading" ? ". Reading copy retypeset from the PDF, with the same words and the plots cut from it; the layout is ours" : ", with only its blank margins trimmed"}.
      {" "}Lean from the authors' artifact, built here on Lean {lean.version}. Ties and notes made with AI, not reviewed by the authors.
    </p>
  );

  return (
    <div className="page">
      <button type="button" className="skip" onClick={() => document.querySelector<HTMLElement>("[data-paper-pane]")?.focus()}>Skip to the paper</button>
      <header className="bar">
        <a className="bar__home" href={routeHref({})} aria-label="Proof Reader, all papers">
          <img src={`${import.meta.env.BASE_URL}plectis.svg`} alt="" />
          <span className="bar__name">Proof Reader</span>
        </a>
        <div className="bar__title">
          {copy === "reading" && edition.reading ? <p className="bar__paper">{paper.short_title}</p> : <h1 className="bar__paper">{paper.short_title}</h1>}
          <p>{paper.authors.join(", ")}</p>
        </div>
        {edition.reading && copy === "reading" && (
          <button type="button" className="bar__contents" aria-expanded={rail} onClick={() => setRail(!rail)}>Contents</button>
        )}
        {back && copy === "reading" && <button type="button" className="bar__back" onClick={jumpBack}>Back to {back}</button>}
        {edition.reading && (
          <div className="switch" role="group" aria-label="The left-hand page">
            <button type="button" aria-pressed={copy === "reading"} onClick={() => switchCopy("reading")}>Reading copy</button>
            <button type="button" aria-pressed={copy === "pdf"} onClick={() => switchCopy("pdf")}>PDF</button>
          </div>
        )}
        <div className="stepper">
          <button type="button" onClick={() => step(-1)} disabled={order === 0}>Previous</button>
          <span title="Step through the sentences tied to the Lean">{order >= 0 ? `Tie ${order + 1} of ${edition.passages.length}` : `${edition.passages.length} ties`}</span>
          <button type="button" onClick={() => step(1)} disabled={at.current >= edition.passages.length - 1}>Next</button>
        </div>
        <div className="switch" role="group" aria-label="The right-hand page">
          <button type="button" aria-pressed={view === "lean"} onClick={() => show("lean")}>Lean</button>
          <button type="button" aria-pressed={view === "map"} onClick={() => show("map")}>Map</button>
        </div>
        <a className="bar__link" href={paper.url}>Published paper</a>
        <a className="bar__link" href={lean.source}>Lean artifact</a>
      </header>
      <main className={`spread${copy === "reading" && edition.reading ? " spread--reading" : ""}`} ref={spread}>
        {copy === "reading" && edition.reading ? (
          <>
            <Contents
              outline={edition.reading.outline}
              current={section}
              words={edition.reading.words}
              open={rail}
              declarations={edition.declarations}
              ready={html !== null}
              onJump={jumpTo}
              onTop={jumpTop}
              onName={pickName}
              onPdf={() => switchCopy("pdf")}
            />
            {html ? (
              <ReadingPane
                ref={pdf}
                html={html}
                passages={edition.passages}
                active={active}
                lit={litPassages}
                start={opening.current}
                place={place}
                onActive={setActive}
                onSection={setSection}
                onPick={pickPassage}
                onName={pickName}
                onPage={toPdfPage}
                onJump={onJump}
                onUserScroll={release}
                foot={<footer className="foot foot--sheet">{credit}</footer>}
              />
            ) : (
              <p className="status" data-paper-pane>Opening the paper…</p>
            )}
          </>
        ) : (
          <Suspense fallback={<p className="status" data-paper-pane>Opening the PDF…</p>}>
            <PdfPane
              ref={pdf}
              url={paperFile(edition.slug, "paper.pdf")}
              sizes={paper.sizes}
              crop={paper.crop}
              passages={edition.passages}
              mentions={edition.mentions}
              active={active}
              lit={litPassages}
              start={opening.current}
              openAt={pdfPage}
              onActive={setActive}
              onPick={pickPassage}
              onName={pickName}
              onUserScroll={release}
            />
          </Suspense>
        )}
        <div className="spread__gutter" />
        {view === "lean" ? (
          <LeanPane
            edition={edition}
            selected={selected}
            reading={axiom ? [axiom] : reading}
            exact={axiom || !activePassage ? null : exact}
            away={!active && !pinned && !axiom}
            onSelect={choose}
            onPassage={toPassage}
            onBack={fromMap ? () => show("map") : undefined}
          />
        ) : (
          <ProofMap edition={edition} graph={graph} selected={pinned} litIds={litIds} axiom={axiom} onAxiom={setAxiom} onSelect={openFromMap} />
        )}
        <Threads root={spread as RefObject<HTMLElement | null>} target={{ passage: active, line: exact?.[0] ?? focus?.line ?? null }} />
      </main>
      <footer className="foot foot--desk">{credit}</footer>
    </div>
  );
}

interface MapProps {
  edition: Edition;
  graph: ReturnType<typeof editionGraph>;
  selected: string | null;
  litIds: ReadonlySet<string>;
  axiom: string | null;
  onAxiom(name: string | null): void;
  onSelect(id: string | null): void;
}

function ProofMap({ edition, graph, selected, litIds, axiom, onAxiom, onSelect }: MapProps) {
  const map = useRef<MapViewHandle>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const { analytics, lean, claims } = edition;
  const types = useMemo(() => edition.declarations.filter(isType), [edition]);
  // A map draws one claim's proof. A paper with several gets a switch.
  const [goal, setGoal] = useState(claims[0]?.id);
  const claim = claims.find((c) => c.id === goal) ?? claims[0];

  useEffect(() => {
    const timers = [
      window.setTimeout(() => map.current?.expandAll(), 0),
      window.setTimeout(() => map.current?.fitAll(false), 160),
      window.setTimeout(() => map.current?.fitAll(false), 600),
      window.setTimeout(() => map.current?.fitAll(false), 1100),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [graph, goal]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => map.current?.fitAll(false), 120);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <aside className="leaf leaf--map" aria-label="Map of the Lean proof">
      <div className="facts">
        <p>Each card is a Lean declaration, resting on the ones below it. {lean.scope}</p>
        {analytics.axioms.map((name) => (
          <p key={name}>
            <button type="button" className="fact" aria-pressed={axiom === name} onClick={() => onAxiom(axiom === name ? null : name)}>{name}</button>{" "}
            is an axiom. {list(analytics.resting_on_axioms[name] ?? [])} rest on it
            {analytics.free_of_axioms.length > 0 && <>; {list(analytics.free_of_axioms)} do not</>}.
          </p>
        ))}
      </div>
      {claims.length > 1 && (
        <div className="claims" role="group" aria-label="Which claim's proof to show">
          {claims.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === claim?.id} onClick={() => setGoal(c.id)}>{c.title}</button>
          ))}
        </div>
      )}
      <div className="map-canvas" ref={canvas}>
        <ArgumentTree
          key={goal}
          ref={map}
          graph={graph}
          goal={goal}
          insets={INSETS}
          persist={false}
          compact
          mode="overview"
          selected={selected ?? undefined}
          litIds={litIds}
          rootContent={<p className="plate-quote">{claim?.title}</p>}
          rootExcerpt={<span>{claim?.title}</span>}
          onSelect={onSelect}
          onTrace={(id) => onSelect(id)}
        />
      </div>
      {types.length > 0 && (
        <div className="vocab" aria-label="Types the proof is written in">
          <span>Types</span>
          {types.map((d) => (
            <button key={d.id} type="button" data-vocab={d.id} className={litIds.has(d.id) ? "is-lit" : ""} onClick={() => onSelect(d.id)}>
              {d.id}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

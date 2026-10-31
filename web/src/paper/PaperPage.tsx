// One paper, laid out as an open book: the authors' PDF on the left page and
// their Lean on the right, with each sentence level with the Lean it describes.
// Scroll the paper and the Lean follows; click anything and the other side goes
// there. The map of the proof takes the right-hand page when asked for.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArgumentTree, type Insets, type MapViewHandle } from "../map/ArgumentTree";
import { editionGraph, isType } from "../model/fromEdition";
import { paperFile, type Edition } from "../app/edition";
import { routeHref } from "../app/router";
import { LeanPane } from "../lean/LeanPane";
import { PdfPane, type PdfHandle } from "./PdfPane";
import { Threads } from "./Threads";

const INSETS: Insets = { top: 22, right: 22, bottom: 22, left: 22 };
type View = "lean" | "map";

function list(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function PaperPage({ edition, record }: { edition: Edition; record?: string }) {
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const spread = useRef<HTMLElement>(null);
  const pdf = useRef<PdfHandle>(null);
  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const declarations = useMemo(() => new Map(edition.declarations.map((d) => [d.id, d])), [edition]);

  const firstPassage = useCallback(
    (id: string) => declarations.get(id)?.passages[0] ?? edition.claims.find((c) => c.id === id)?.passage ?? null,
    [declarations, edition],
  );
  const start = (record ? firstPassage(record) : null) ?? edition.claims[0]?.passage ?? edition.passages[0]?.id ?? null;

  const [active, setActive] = useState<string | null>(start);
  const [pinned, setPinned] = useState<string | null>(record ?? null);
  const [axiom, setAxiom] = useState<string | null>(null);
  const [view, setView] = useState<View>("lean");
  const [fromMap, setFromMap] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const activePassage = active ? passages.get(active) : undefined;
  const reading = useMemo(() => activePassage?.lean ?? [], [activePassage]);
  const selected = pinned ?? reading[0] ?? null;
  const order = active ? edition.passages.findIndex((p) => p.id === active) : -1;

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
    },
    [passages],
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

  const toPassage = useCallback((id: string) => {
    setActive(id);
    pdf.current?.scrollToPassage(id);
  }, []);

  const step = useCallback(
    (by: number) => {
      const now = edition.passages.findIndex((p) => p.id === activeRef.current);
      const next = edition.passages[Math.max(0, Math.min(edition.passages.length - 1, (now < 0 ? 0 : now) + by))];
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
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest?.("input, textarea")) return;
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

  return (
    <div className="page">
      <button type="button" className="skip" onClick={() => document.querySelector<HTMLElement>(".pdf")?.focus()}>Skip to the paper</button>
      <header className="bar">
        <a className="bar__home" href={routeHref({})}>
          <img src={`${import.meta.env.BASE_URL}plectis.svg`} alt="" />
          Proof Reader
        </a>
        <div className="bar__title">
          <h1>{paper.short_title}</h1>
          <p>{paper.authors.join(", ")}</p>
        </div>
        <div className="stepper">
          <button type="button" onClick={() => step(-1)} disabled={order <= 0}>Previous</button>
          <span>Link {order >= 0 ? order + 1 : 0} of {edition.passages.length}</span>
          <button type="button" onClick={() => step(1)} disabled={order >= edition.passages.length - 1}>Next</button>
        </div>
        <div className="switch" role="group" aria-label="The right-hand page">
          <button type="button" aria-pressed={view === "lean"} onClick={() => show("lean")}>Lean</button>
          <button type="button" aria-pressed={view === "map"} onClick={() => show("map")}>Map</button>
        </div>
        <a className="bar__link" href={paper.url}>Published paper</a>
        <a className="bar__link" href={lean.source}>Lean artifact</a>
      </header>
      <main className="spread" ref={spread}>
        <PdfPane
          ref={pdf}
          url={paperFile(edition.slug, "paper.pdf")}
          sizes={paper.sizes}
          edges={paper.text_edges}
          passages={edition.passages}
          mentions={edition.mentions}
          active={active}
          lit={litPassages}
          start={start}
          onActive={setActive}
          onPick={pickPassage}
          onName={pickName}
          onUserScroll={release}
        />
        <div className="spread__gutter" />
        {view === "lean" ? (
          <LeanPane
            edition={edition}
            selected={selected}
            reading={axiom ? [axiom] : reading}
            onSelect={choose}
            onPassage={toPassage}
            onBack={fromMap ? () => show("map") : undefined}
          />
        ) : (
          <ProofMap edition={edition} graph={graph} selected={pinned} litIds={litIds} axiom={axiom} onAxiom={setAxiom} onSelect={openFromMap} />
        )}
        <Threads root={spread as RefObject<HTMLElement | null>} target={{ passage: active, line: focus?.line ?? null }} />
      </main>
      <footer className="foot">
        <p>
          Paper © its authors, <a href={paper.licence_url}>{paper.licence}</a>, shown unchanged. Lean from the authors' artifact, checked on Lean {lean.version}. Links
          and notes made with AI, not reviewed by the authors.
        </p>
      </footer>
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
  const { analytics, lean } = edition;
  const types = useMemo(() => edition.declarations.filter(isType), [edition]);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => map.current?.expandAll(), 0),
      window.setTimeout(() => map.current?.fitAll(false), 160),
      window.setTimeout(() => map.current?.fitAll(false), 600),
      window.setTimeout(() => map.current?.fitAll(false), 1100),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [graph]);

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
        <p>A map of the proof in {Object.keys(lean.files).join(", ")}. Each card is a Lean declaration, resting on the ones below it.</p>
        {analytics.axioms.map((name) => (
          <p key={name}>
            <button type="button" className="fact" aria-pressed={axiom === name} onClick={() => onAxiom(axiom === name ? null : name)}>{name}</button>{" "}
            is an axiom. {list(analytics.resting_on_axioms[name] ?? [])} rest on it
            {analytics.free_of_axioms.length > 0 && <>; {list(analytics.free_of_axioms)} do not</>}.
          </p>
        ))}
      </div>
      <div className="map-canvas" ref={canvas}>
        <ArgumentTree
          ref={map}
          graph={graph}
          goal={edition.claims[0]?.id}
          insets={INSETS}
          persist={false}
          compact
          mode="overview"
          selected={selected ?? undefined}
          litIds={litIds}
          rootContent={<p className="plate-quote">{edition.claims[0]?.title}</p>}
          rootExcerpt={<span>{edition.claims[0]?.title}</span>}
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

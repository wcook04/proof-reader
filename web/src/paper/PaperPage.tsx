// One paper: the PDF, the map of its Lean declarations and the Lean source,
// following one another. Scrolling the paper lights what that passage is about;
// choosing anything elsewhere brings the paper and the source to it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArgumentTree, type Insets, type MapViewHandle } from "../map/ArgumentTree";
import { editionGraph } from "../model/fromEdition";
import { paperFile, type Edition } from "../app/edition";
import { routeHref } from "../app/router";
import { LeanPane } from "../lean/LeanPane";
import { PdfPane, type PdfHandle } from "./PdfPane";

const INSETS: Insets = { top: 12, right: 12, bottom: 12, left: 12 };
type Panel = "paper" | "map" | "lean";

/** "isoL and isoR rest" or, negated, "isoL and isoR do". */
function sentence(names: string[], negated = false): string {
  const list = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  if (negated) return `${list} ${names.length === 1 ? "does" : "do"}`;
  return `${list} ${names.length === 1 ? "rests" : "rest"}`;
}

export function PaperPage({ edition, record }: { edition: Edition; record?: string }) {
  const graph = useMemo(() => editionGraph(edition), [edition]);
  const goal = edition.claims[0]?.id;
  const map = useRef<MapViewHandle>(null);
  const pdf = useRef<PdfHandle>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(record ?? null);
  const [axiom, setAxiom] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("paper");

  const passages = useMemo(() => new Map(edition.passages.map((p) => [p.id, p])), [edition]);
  const activePassage = active ? passages.get(active) : undefined;
  const reading = useMemo(() => activePassage?.lean ?? [], [activePassage]);
  const selected = pinned ?? reading[0] ?? null;

  const litIds = useMemo(() => {
    if (axiom) return new Set([axiom, ...(edition.analytics.resting_on_axioms[axiom] ?? [])]);
    return new Set(pinned ? [pinned] : reading);
  }, [axiom, edition, pinned, reading]);

  const litPassages = useMemo(() => {
    const out = new Set<string>();
    for (const id of litIds) for (const p of edition.declarations.find((d) => d.id === id)?.passages ?? []) out.add(p);
    return out;
  }, [edition, litIds]);

  const keyOfRead = reading.join("|");
  useEffect(() => {
    if (!pinned && !axiom && reading.length) map.current?.focusIds(reading);
    // Follow only when the passage changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOfRead]);

  useEffect(() => {
    const open = window.setTimeout(() => map.current?.expandAll(), 0);
    const frame = window.setTimeout(() => map.current?.fitAll(false), 90);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(frame);
    };
  }, [graph]);

  const choose = useCallback(
    (id: string | null) => {
      setAxiom(null);
      setPinned(id);
      if (!id) return;
      window.history.replaceState(null, "", routeHref({ paper: edition.slug, record: id }));
      const d = edition.declarations.find((x) => x.id === id);
      const claim = edition.claims.find((c) => c.id === id);
      const first = d?.passages[0] ?? claim?.passage;
      if (first) {
        setActive(first);
        pdf.current?.scrollToPassage(first);
      }
      map.current?.focusIds([id]);
    },
    [edition],
  );

  useEffect(() => {
    if (record) window.setTimeout(() => choose(record), 300);
    // Only on arrival at a shared address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPassage = useCallback(
    (id: string) => {
      const passage = passages.get(id);
      setAxiom(null);
      setActive(id);
      setPinned(passage?.lean[0] ?? null);
      if (passage?.lean.length) map.current?.focusIds(passage.lean);
    },
    [passages],
  );

  const toPassage = useCallback(
    (id: string) => {
      setActive(id);
      pdf.current?.scrollToPassage(id);
      setPanel("paper");
    },
    [],
  );

  const release = useCallback(() => {
    setPinned(null);
    setAxiom(null);
  }, []);

  const { paper, lean, analytics } = edition;
  const lightAxiom = (name: string) => {
    setPinned(null);
    setAxiom(axiom === name ? null : name);
    map.current?.focusIds(analytics.resting_on_axioms[name] ?? [name]);
  };

  return (
    <div className="page" data-panel={panel}>
      <header className="bar">
        <a className="bar__home" href={routeHref({})} aria-label="All papers">Proof Reader</a>
        <div className="bar__title">
          <h1>{paper.short_title}</h1>
          <p>{paper.authors.join(", ")}</p>
        </div>
        <nav className="bar__tabs" aria-label="Show">
          {(["paper", "map", "lean"] as Panel[]).map((p) => (
            <button key={p} type="button" aria-pressed={panel === p} onClick={() => setPanel(p)}>
              {p === "paper" ? "Paper" : p === "map" ? "Map" : "Lean"}
            </button>
          ))}
        </nav>
        <a className="bar__link" href={paper.url}>The paper</a>
        <a className="bar__link" href={lean.source}>The Lean source</a>
      </header>
      <main className="panes">
        <section className="pane pane--paper">
          <PdfPane
            ref={pdf}
            url={paperFile(edition.slug, "paper.pdf")}
            sizes={paper.sizes}
            passages={edition.passages}
            active={active}
            lit={litPassages}
            onActive={setActive}
            onPick={pickPassage}
            onUserScroll={release}
          />
        </section>
        <section className="pane pane--map" aria-label="Map of the Lean proof">
          <div className="facts">
            <p>
              {analytics.linked_to_paper} of {analytics.declarations} Lean declarations tied to the paper. Checked on Lean {edition.lean.version}.
            </p>
            {analytics.axioms.map((name) => (
              <p key={name}>
                <code>{name}</code>: {sentence(analytics.resting_on_axioms[name] ?? [])} on it
                {analytics.free_of_axioms.length > 0 && <>; {sentence(analytics.free_of_axioms, true)} not</>}.{" "}
                <button type="button" className="fact" aria-pressed={axiom === name} onClick={() => lightAxiom(name)}>
                  {axiom === name ? "Clear" : "Show on the map"}
                </button>
              </p>
            ))}
          </div>
          <div className="map-canvas">
            <ArgumentTree
              ref={map}
              graph={graph}
              goal={goal}
              insets={INSETS}
              persist={false}
              compact
              mode="steps"
              selected={pinned ?? undefined}
              litIds={litIds}
              rootContent={<p className="plate-quote">{edition.claims[0]?.title}</p>}
              rootExcerpt={<span>{edition.claims[0]?.title}</span>}
              onSelect={choose}
              onTrace={(id) => choose(id)}
            />
          </div>
        </section>
        <section className="pane pane--lean">
          <LeanPane edition={edition} selected={selected} onSelect={choose} onPassage={toPassage} />
        </section>
      </main>
      <footer className="foot">
        <p>
          The paper is shown unchanged under <a href={paper.licence_url}>{paper.licence}</a>, © its authors. {lean.scope} The ties
          and notes are made with AI and have not been reviewed by the authors.
        </p>
      </footer>
    </div>
  );
}

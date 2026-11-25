import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { selecting } from "../paper/clickIntent";
import type { OutlineEntry } from "../app/edition";
import { Lockup, OwnerLink, ReaderHome, ReaderMark, ReaderMenu } from "../app/Family";
import { PHYSLIB_MAP, readRoute, routeHref } from "../app/router";
import { setScheme, useScheme } from "../app/theme";
import { LeanCode, useFileLines } from "../lean/code";
import { Contents } from "../paper/Contents";
import { PaperSplit } from "../paper/PaperSplit";
import { Doc } from "../proof/Fidelity";
import { NoteCredit } from "../proof/Note";
import { DependencyMap, type MapNode } from "./DependencyMap";
import "./physlib-map.css";

const base = `${import.meta.env.BASE_URL}api-maps/${PHYSLIB_MAP}/`;
const indexRoute = (record?: string) => routeHref({ paper: PHYSLIB_MAP, record });
const tracker = "https://physlib.io/api-tracker";

interface MapDeclaration {
  fullName: string;
  doc?: string;
  line: number;
  signature: string;
  source?: string;
}
interface Group {
  index: number;
  file: string;
  declarations: MapDeclaration[];
}
interface Reference {
  index: number;
  text: string;
  apiMap: string | null;
}
interface Phrase {
  id: number;
  citation: string;
  quote: string;
  names: string[];
  tone: number;
  html: string;
}
interface PassageNote {
  title: string;
  anchor: number;
  endLine: number;
  html: string;
}
const panes = ["auto", "graph", "lean"] as const;
type Pane = typeof panes[number];
const savedPane = (): Pane => {
  const mode = history.state?.apiMapPane;
  return panes.includes(mode) ? mode : "auto";
};
const savedMinimised = () => history.state?.apiMapGraphMinimised === true;
interface Edition {
  title: string;
  repo: string;
  commit: string;
  path: string;
  file: string;
  index: string;
  html: string;
  outline: Pick<OutlineEntry, "id" | "number" | "title" | "level">[];
  leanReferences: Group[];
  references: Reference[];
  glossary: Record<string, string>;
  noteHtml: Record<string, string>;
  paragraphs: Record<string, string[]>;
  passageNotes: Record<string, PassageNote>;
  phrases: Phrase[];
  tones: Record<string, number>;
  concepts: { name: string; citations: number[] }[];
  sectionTopics: Record<string, number[]>;
  maps: MapNode[];
}

async function getFile<T>(name: string, parse: (response: Response) => Promise<T>) {
  const response = await fetch(base + name);
  if (!response.ok) throw new Error(`Could not open ${name}`);
  return parse(response);
}

export function PhyslibMap() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void getFile("edition.json", (response) => response.json() as Promise<Edition>).then((data) => {
      if (!current) return;
      setEdition(data);
      document.title = `${data.title} · Physlib API map · Proof Reader`;
    }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, []);
  if (failed) return (
    <>
      <header className="bar"><div className="bar__left"><Lockup /></div></header>
      <p className="status" role="alert">Could not open the sample. <a href={tracker}>Read the map on Physlib</a>.</p>
    </>
  );
  return edition ? <MapReader edition={edition} /> : <p className="status">Opening the Physlib API map…</p>;
}

const citeKey = (group: Group) => `lean-${group.index}`;
const selectedRecord = () => readRoute().record ?? null;
const sourceOf = (edition: Edition, file: string, line?: number) =>
  `https://github.com/${edition.repo}/blob/${edition.commit}/${file}${line ? `#L${line}` : ""}`;

function MapReader({ edition }: { edition: Edition }) {
  const [record, setRecord] = useState(selectedRecord);
  const [mode, setMode] = useState(savedPane);
  const [graphFitHeight, setGraphFitHeight] = useState(0);
  const [graphMinimised, setGraphMinimised] = useState(savedMinimised);
  const [section, setSection] = useState<string | null>(null);
  const [rail, setRail] = useState(false);
  const [sourceLine, setSourceLine] = useState<number | null>(null);
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [lit, setLit] = useState<string[] | null>(null);
  const [pickedPhrase, setPickedPhrase] = useState<number | null>(null);
  const scheme = useScheme();
  const paper = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const focusBack = useRef<HTMLAnchorElement | null>(null);
  const scrollTarget = useRef<"address" | number | null>("address");
  const scrollSource = useRef(false);
  const scrollDeclaration = useRef<string | null>(null);
  const citation = record?.startsWith("@") ? record.slice(1) : "";
  const group = edition.leanReferences.find((item) => citeKey(item) === citation);
  const ref = edition.references.find((item) => `ref-${item.index}` === citation);
  const paragraph = edition.paragraphs[citation];
  const paragraphId = paragraph ? citation : Object.keys(edition.paragraphs).find((id) => edition.paragraphs[id].includes(citation));
  const annotation = paragraphId && edition.passageNotes?.[paragraphId];
  const hasLean = !!group || paragraph?.some((id) => id.startsWith("lean-")) === true;
  const combined = hasLean && !graphMinimised;
  const activeMode = graphMinimised ? mode : "auto";
  const showGraph = record !== "@index" && (activeMode === "graph" || (activeMode === "auto" && !hasLean && !ref));
  const picked = new Set(paragraph ?? [citation]);
  const paragraphReferences = paragraph?.flatMap((id) => {
    const lean = edition.leanReferences.find((item) => citeKey(item) === id);
    const general = edition.references.find((item) => `ref-${item.index}` === id);
    return lean || general ? [{ id, lean, general }] : [];
  });
  const outline = useMemo(() => [...edition.outline, { id: "dependency-map", number: "", title: "Dependency map", level: 2 }]
    .map((item) => ({ ...item, ties: 0, page: null })), [edition]);
  const order = useMemo(() => [...new Set(Array.from(edition.html.matchAll(/data-api-citation="(lean-\d+)"/g), (match) => match[1]))], [edition]);
  const position = order.indexOf(paragraph?.find((id) => id.startsWith("lean-")) ?? citation);
  const phrasesOf = useMemo(() => {
    const byName = new Map<string, Phrase[]>();
    for (const phrase of edition.phrases) for (const name of phrase.names) byName.set(name, [...byName.get(name) ?? [], phrase]);
    return byName;
  }, [edition]);
  const declarations = useMemo(() => edition.leanReferences.flatMap((item) => item.declarations.map((d) => ({
    id: d.fullName, plain: edition.glossary[d.fullName], file: item.file, line: d.line, end_line: d.line,
  }))), [edition]);

  const find = (id: string) => article.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  const findCitation = (id: string) => article.current?.querySelector<HTMLAnchorElement>(`[data-api-citation="${CSS.escape(id)}"]`);
  const locate = (element?: Element | null, center = false) => {
    const pane = paper.current;
    if (!pane || !element) return;
    const top = element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTop = top - (center ? pane.clientHeight * 0.23 : 20);
  };
  const navigate = (next: string | null, jump = false, nextMode = mode) => {
    if (selectedRecord() !== next) {
      const top = paper.current?.scrollTop ?? 0;
      history.replaceState({ ...history.state, apiMapPane: mode, apiMapGraphMinimised: graphMinimised, apiMapTop: top }, "");
      history.pushState({ apiMapPane: nextMode, apiMapGraphMinimised: graphMinimised, apiMapTop: jump ? undefined : top }, "", indexRoute(next ?? undefined));
    }
    if (jump && next === record) {
      const id = next?.slice(1);
      if (id) locate(findCitation(id) ?? find(id), !!findCitation(id));
      else if (paper.current) paper.current.scrollTop = 0;
    } else if (jump) scrollTarget.current = "address";
    scrollDeclaration.current = null;
    setSourceLine(null);
    setRecord(next);
    setRail(false);
    setPickedPhrase(null);
  };

  const focusDeclaration = (name: string) => {
    const panel = right.current;
    const entry = panel?.querySelector<HTMLElement>(`[data-lean-name="${CSS.escape(name)}"]`);
    if (!panel || !entry) return;
    const fold = entry.closest("details");
    if (fold) fold.open = true;
    panel.scrollTop += entry.getBoundingClientRect().top - panel.getBoundingClientRect().top - 10;
    entry.focus({ preventScroll: true });
    scrollDeclaration.current = null;
  };
  const openDeclaration = (name: string) => {
    const hit = edition.leanReferences.find((item) => item.declarations.some((d) => d.fullName === name));
    if (!hit) return;
    navigate(`@${citeKey(hit)}`, true);
    scrollDeclaration.current = name;
    if (hit === group && sourceLine === null) focusDeclaration(name);
  };

  useEffect(() => {
    const onAddress = () => {
      const next = selectedRecord();
      setMode(savedPane());
      setGraphMinimised(savedMinimised());
      if (next === record) return;
      scrollTarget.current = typeof history.state?.apiMapTop === "number" ? history.state.apiMapTop : "address";
      scrollDeclaration.current = null;
      setSourceLine(null);
      setRecord(next);
      setPickedPhrase(null);
    };
    window.addEventListener("hashchange", onAddress);
    window.addEventListener("popstate", onAddress);
    return () => {
      window.removeEventListener("hashchange", onAddress);
      window.removeEventListener("popstate", onAddress);
    };
  }, [record]);

  useEffect(() => {
    let current = true;
    void getFile("API-map.md", (response) => response.text()).then((text) => {
      if (current) setMarkdown(text);
    }, () => undefined);
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useLayoutEffect(() => {
    article.current?.querySelectorAll<HTMLAnchorElement>("[data-api-citation]").forEach((link) => {
      const active = picked.has(link.dataset.apiCitation ?? "");
      link.classList.toggle("is-active", active);
      link.setAttribute("aria-expanded", String(active));
    });
    article.current?.querySelectorAll<HTMLElement>("[data-api-paragraph]").forEach((block) => {
      const isOpen = block.dataset.apiParagraph === citation;
      block.classList.toggle("is-inspected", isOpen);
      block.querySelector(".api-map__passage")?.setAttribute("aria-expanded", String(isOpen || !!block.querySelector(".api-map__cite.is-active")));
    });
    if (scrollTarget.current === "address") {
      const mark = citation ? findCitation(citation) : null;
      const target = mark ?? (citation ? find(citation) : null);
      locate(target, !!mark);
      const pane = paper.current;
      if (target && pane && document.fonts.status === "loading") {
        const top = pane.scrollTop;
        void document.fonts.ready.then(() => {
          if (pane.isConnected && selectedRecord() === record && Math.abs(pane.scrollTop - top) < 2) {
            locate(target, !!mark);
          }
        });
      }
      if (!citation && paper.current) paper.current.scrollTop = 0;
    } else if (scrollTarget.current !== null && paper.current) {
      paper.current.scrollTop = scrollTarget.current;
    }
    scrollTarget.current = null;
    if (right.current) right.current.scrollTop = 0;
  }, [citation]);

  useLayoutEffect(() => {
    if (!showGraph && sourceLine === null && scrollDeclaration.current) focusDeclaration(scrollDeclaration.current);
  }, [citation, sourceLine, showGraph]);

  const useFiles = () => {
    if (files || sourceFailed) return;
    void getFile("source.json", (response) => response.json() as Promise<Record<string, string>>)
      .then(setFiles, () => setSourceFailed(true));
  };
  const openSource = (line: number) => {
    scrollSource.current = true;
    setSourceLine(line);
    useFiles();
  };
  useLayoutEffect(() => {
    if (!scrollSource.current || sourceLine === null || !files) return;
    right.current?.querySelector(`[data-line="${sourceLine}"]`)?.scrollIntoView({ block: "center" });
    scrollSource.current = false;
  }, [sourceLine, files]);

  const showPhrase = (id: number) => {
    const element = article.current?.querySelector<HTMLElement>(`[data-phrase="${id}"]`);
    if (!element) return;
    locate(element, true);
    element.classList.remove("is-flash");
    void element.offsetWidth;
    element.classList.add("is-flash");
  };
  const openPhrase = (id: number) => {
    const phrase = edition.phrases[id];
    navigate(`@${phrase.citation}`);
    scrollDeclaration.current = phrase.names[0];
    setPickedPhrase(id);
    if (citation === phrase.citation && sourceLine === null) focusDeclaration(phrase.names[0]);
  };

  // Light a phrase and its declarations together, wherever the pointer is.
  useLayoutEffect(() => {
    const names = new Set(lit ?? []);
    article.current?.querySelectorAll<HTMLElement>("[data-phrase]").forEach((element) => {
      const phrase = edition.phrases[Number(element.dataset.phrase)];
      element.classList.toggle("is-lit", phrase.names.some((name) => names.has(name)));
      element.classList.toggle("is-active", phrase.citation === citation || paragraph?.includes(phrase.citation) === true);
      element.classList.toggle("is-picked", phrase.id === pickedPhrase);
    });
    right.current?.querySelectorAll<HTMLElement>("[data-lean-name]").forEach((element) => {
      const name = element.dataset.leanName ?? "";
      element.classList.toggle("is-lit", names.has(name));
      element.classList.toggle("is-picked", pickedPhrase !== null && edition.phrases[pickedPhrase].names.includes(name));
    });
  });

  const close = () => {
    navigate(null);
    focusBack.current?.focus({ preventScroll: true });
  };
  const step = (direction: -1 | 1) => {
    const next = position === -1 && direction === -1 ? order.at(-1) : order[position + direction];
    if (next) navigate(`@${next}`, true);
  };
  const declarationsFor = (item: Group) => item.declarations.map((d) => (
    <DeclarationCard key={d.fullName} decl={d} title={edition.glossary[d.fullName]} sourceUrl={sourceOf(edition, item.file, d.line)}
      tone={edition.tones[citeKey(item)]} phrases={phrasesOf.get(d.fullName) ?? []} onPhrase={showPhrase} note={edition.noteHtml[d.fullName]}
      onLight={(on) => setLit(on ? [d.fullName] : null)}
      onSource={() => {
        if (item !== group) navigate(`@${citeKey(item)}`);
        openSource(d.line);
      }} />
  ));
  const selectMode = (next: Pane) => {
    if (record === "@index") navigate(null, false, next);
    else if (mode !== next) history.replaceState({ ...history.state, apiMapPane: next }, "");
    setMode(next);
    if (right.current) right.current.scrollTop = 0;
  };
  const changeLayout = (minimised: boolean) => {
    const next = minimised ? "lean" : "auto";
    history.replaceState({ ...history.state, apiMapPane: next, apiMapGraphMinimised: minimised }, "");
    setMode(next);
    setGraphMinimised(minimised);
  };
  const copy = async (read: () => string | Promise<string>, success: string) => {
    try {
      const content = read();
      await navigator.clipboard.writeText(typeof content === "string" ? content : await content);
      setMessage(success);
    } catch {
      setMessage("Could not copy. You can select the text or open the source.");
    }
  };
  const nextSection = () => {
    const top = paper.current?.getBoundingClientRect().top ?? 0;
    const current = [...outline].reverse().find((item) => (find(item.id)?.getBoundingClientRect().top ?? Infinity) < top + 36);
    setSection(current?.id ?? null);
  };

  return (
    <div className="page api-map" onKeyDown={(event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (document.querySelector(".reader-menu:popover-open")) return;
        if (rail) setRail(false);
        else if (citation) close();
      }
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (event.key === "j" || event.key === "k") {
        step(event.key === "j" ? 1 : -1);
        event.preventDefault();
      }
    }}>
      <a className="skip" href="#map-text" onClick={(event) => { event.preventDefault(); paper.current?.focus(); }}>Skip to the map</a>
      <header className="bar bar--reader api-map__bar">
        <div className="bar__left"><ReaderHome /></div>
        <div className="bar__title"><ReaderMark paper={PHYSLIB_MAP} /><p className="bar__paper">{edition.title}</p></div>
        <div className="bar__right">
          <ReaderMenu onOpen={() => setRail(false)}>
            <button type="button" onClick={() => {
              setRail(true);
              requestAnimationFrame(() => document.querySelector<HTMLElement>(".rail__search input")?.focus());
            }}>Search the map</button>
            <button type="button" className="reader-menu__contents" onClick={() => setRail(true)}>Contents</button>
            <button type="button" onClick={() => document.querySelector<HTMLElement>("#dependency-map")?.scrollIntoView({ block: "start" })}>Dependency map</button>
            <button type="button" onClick={() => navigate("@index")}>Glossary</button>
            <a href={routeHref({})}>All editions</a>
            <a href={sourceOf(edition, edition.file)}>Source Markdown</a>
            <button type="button" title="Copy the original Markdown with Unicode formulas" onClick={() => void copy(() => markdown ?? getFile("API-map.md", (response) => response.text()), "Markdown copied")}>Copy page</button>
            <button type="button" className="bar__theme" onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}>{scheme === "dark" ? "Use the day theme" : "Use the night theme"}</button>
          </ReaderMenu>
          <OwnerLink />
        </div>
        <div className="api-map__copy-status" role="status" hidden={!message}>{message}</div>
      </header>
      <main className={`spread spread--reading has-right api-map__spread${group || ref || paragraph || record === "@index" ? " is-open" : ""}`}>
        <Contents
          noun="map" outline={outline} current={section} open={rail} declarations={declarations} files={files ?? {}} html={edition.html} copy="reading"
          topLabel="Start of map"
          marks={Object.fromEntries(Object.entries(edition.sectionTopics).map(([id, topics]) => [id,
            <span key={id} className="api-map__topic-bars" title={`Cites Lean on: ${topics.map((t) => edition.concepts[t].name).join(", ")}`}>
              {topics.map((t) => <span key={t} data-tone={t * 2} />)}
            </span>]))}
          keys={<>
            <span className="api-map__key"><span className="api-map__key-label">Topic colours</span>
              {edition.concepts.map((c, t) => <span key={c.name} className="api-map__topic" data-tone={t * 2}>{c.name}</span>)}
            </span>
            <span><kbd>j</kbd> and <kbd>k</kbd> step through Lean citations. <kbd>Esc</kbd> closes a citation.</span>
          </>}
          onTop={() => navigate(null, true)} onJump={(id) => navigate(`@${id}`, true)}
          onBlock={(element) => { locate(element); setRail(false); }}
          onName={openDeclaration}
          onIndex={() => navigate("@index")} onPage={() => undefined} onSearch={useFiles} onClose={() => setRail(false)}
        />
        <div className="left">
          <div className="reading" id="map-text" tabIndex={0} ref={paper} onScroll={nextSection} aria-label="Gauge theory API map">
            <div className="sheet">
              <p className="firstline api-map__credit"><a href={`${tracker}#${edition.path}`}>Physlib API tracker</a> <span aria-hidden="true">/</span> Classical field theory</p>
              <article className="sheet__text" ref={article} dangerouslySetInnerHTML={{ __html: edition.html }} onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                const target = event.target as Element;
                const mark = target.closest<HTMLAnchorElement>("[data-api-citation]");
                const phrase = target.closest<HTMLElement>("[data-phrase]");
                if (!mark && phrase && !target.closest("a")) {
                  event.preventDefault();
                  if (selecting(event)) return;
                  openPhrase(Number(phrase.dataset.phrase));
                  return;
                }
                const block = target.closest<HTMLElement>("[data-api-paragraph]");
                if (!mark && (!block || target.closest("a:not(.api-map__passage)"))) return;
                const link = mark ?? block?.querySelector<HTMLAnchorElement>(".api-map__passage");
                if (!link) return;
                event.preventDefault();
                if (selecting(event)) return;
                focusBack.current = link;
                const record = link.hash.split("/").at(-1) ?? null;
                const isClosedOnMobile = !group && !ref && !paragraph && citation !== "index" && window.matchMedia("(max-width: 900px)").matches;
                navigate(record, isClosedOnMobile);
              }} onMouseOver={(event) => {
                const phrase = (event.target as Element).closest<HTMLElement>("[data-phrase]");
                const names = phrase ? edition.phrases[Number(phrase.dataset.phrase)].names : null;
                if (names?.join() !== lit?.join()) setLit(names);
              }} onMouseLeave={() => setLit(null)} />
              <div className="sheet__text api-map__deps-wrap">
                <DependencyMap maps={edition.maps} current={edition.path} tracker={tracker} home={indexRoute()} />
              </div>
              <footer className="foot api-map__footer">
                <p>Map and Lean by the Physlib contributors. <a href={base + "LICENSE"}>Apache 2.0</a>. Citation groups and signatures from the <a href={edition.index}>tracker index</a> at <a href={`https://github.com/${edition.repo}/commit/${edition.commit}`}><code>{edition.commit.slice(0, 7)}</code></a>.</p>
              </footer>
            </div>
          </div>
        </div>
        <PaperSplit />
        <aside className="proof api-map__aside" id="api-map-references" aria-label="Map references">
          <div className="proof__caption">
            <div className="proof__says"><p><b>{showGraph ? "Dependency graph" : group ? `Lean citation [${group.index}]` : ref ? `Reference {${ref.index}}` : paragraph ? "References in this paragraph" : "Lean glossary"}</b>{!showGraph && group && `, ${group.declarations.length} ${group.declarations.length === 1 ? "declaration" : "declarations"}`}</p></div>
            {citation && <button type="button" className="proof__close" onClick={close}>Close</button>}
          </div>
          <div className="leaf">
            {graphMinimised && <nav className="leaf__tabs api-map__modes" aria-label="What the right pane shows">
              {panes.map((pane) => (
                <button key={pane} type="button" aria-pressed={record !== "@index" && mode === pane}
                  onClick={() => selectMode(pane)}>{pane === "auto" ? "Auto" : pane === "graph" ? "Graph" : "Lean"}</button>
              ))}
              {hasLean && <button type="button" className="api-map__graph-action" onClick={() => changeLayout(false)}>Combine views</button>}
            </nav>}
            {!showGraph && group && <nav className="leaf__tabs" aria-label="Citation view">
              <button type="button" aria-pressed={sourceLine === null} onClick={() => { setSourceLine(null); if (right.current) right.current.scrollTop = 0; }}>This citation</button>
              <button type="button" aria-pressed={sourceLine !== null} onClick={() => openSource(group.declarations[0].line)}>Whole file</button>
              <button type="button" onClick={() => navigate("@index")}>Glossary</button>
              <div className="api-map__step">
                <button type="button" aria-label="Previous citation" title="Previous citation (k)" onClick={() => step(-1)} disabled={position < 1}>←</button>
                <button type="button" aria-label="Next citation" title="Next citation (j)" onClick={() => step(1)} disabled={position === order.length - 1}>→</button>
              </div>
            </nav>}
            <div className={`api-map__windows${combined ? " is-combined" : ""}`}
              style={graphFitHeight > 0 ? { "--api-graph-height": `${graphFitHeight}px` } as CSSProperties : undefined}>
              {!showGraph && <div className="leaf__body api-map__reference-body" ref={right} tabIndex={0} aria-label="Lean and reading notes">
                {(group || paragraph) && sourceLine === null && annotation && paragraphId && (
                  <PassageAnnotation note={annotation} paragraphId={paragraphId} edition={edition}
                    phrase={(pickedPhrase === null ? undefined : edition.phrases[pickedPhrase])
                      ?? (group ? edition.phrases.find((item) => item.citation === citation) : undefined)
                      ?? edition.phrases[annotation.anchor]}
                    onPhrase={showPhrase} />
                )}
                {group ? (
                  <>
                    <div className="api-map__file">
                      <a href={sourceOf(edition, group.file)}>{group.file}</a>
                      <button type="button" onClick={() => void copy(() => location.href, "Citation link copied")}>Copy link</button>
                    </div>
                    {sourceLine === null ? (
                      <details className="api-map__evidence" key={citation}>
                        <summary>Lean declarations</summary>
                        {declarationsFor(group)}
                        <NoteCredit>Proof Reader used AI to draft the reading titles and match phrases to Lean.</NoteCredit>
                      </details>
                    ) : files ? (
                      <div className="decl__code api-map__whole-file">
                        <Code source={files[group.file]} active={sourceLine} />
                      </div>
                    ) : <p className="api-map__aside-note" role="status">{sourceFailed ? "Could not load the local file. Open its source link above." : "Opening the Lean source…"}</p>}
                  </>
                ) : ref ? (
                  <BibliographyReference reference={ref} />
                ) : paragraphReferences ? (
                  <details className="api-map__evidence" key={citation} open={!hasLean || undefined}>
                    <summary>{hasLean ? "Lean declarations and references" : "References"}</summary>
                    {!hasLean && <p className="api-map__aside-note">This passage has no linked Lean.</p>}
                    <div className="api-map__file">
                      <nav className="api-map__paragraph-jumps" aria-label="References in this paragraph">
                        {paragraphReferences.map(({ id, lean, general }) => (
                          <button key={id} type="button" data-tone={lean ? edition.tones[id] : undefined} aria-label={lean ? `Jump to Lean citation ${lean.index}` : `Jump to reference ${general?.index}`}
                            onClick={() => right.current?.querySelector(`[data-reference="${id}"]`)?.scrollIntoView({ block: "start" })}>
                            {lean ? `[${lean.index}]` : `{${general?.index}}`}
                          </button>
                        ))}
                      </nav>
                      <button type="button" onClick={() => void copy(() => location.href, "Paragraph link copied")}>Copy link</button>
                    </div>
                    {paragraphReferences.map(({ id, lean, general }) => (
                      <section className="api-map__paragraph-group" key={id} data-reference={id} data-tone={lean ? edition.tones[id] : undefined}>
                        <button type="button" className="api-map__paragraph-name" onClick={() => navigate(`@${id}`)}>{lean ? `Lean citation [${lean.index}], ${lean.declarations.length} ${lean.declarations.length === 1 ? "declaration" : "declarations"}` : `Reference {${general?.index}}`}</button>
                        {lean && declarationsFor(lean)}
                        {general && <BibliographyReference reference={general} />}
                      </section>
                    ))}
                    {paragraphReferences.some((item) => item.lean) && <NoteCredit>Proof Reader used AI to draft the reading titles and match phrases to Lean.</NoteCredit>}
                  </details>
                ) : (
                  <>
                    <p className="api-map__aside-note api-map__lede">The map cites {edition.leanReferences.reduce((n, item) => n + item.declarations.length, 0)} Lean declarations in {edition.leanReferences.length} numbered citations, listed here under {edition.concepts.length} topics. In the map, the phrases a declaration states are underlined in its topic’s colour. Point at a title to highlight its phrase in the map.</p>
                    {edition.concepts.map((concept, topic) => <section key={concept.name} className="api-map__topic-group">
                    <h3 className="api-map__topic-name" data-tone={topic * 2}><span className="api-map__topic">{concept.name}</span></h3>
                    <ol className="api-map__references">
                      {edition.leanReferences.filter((item) => concept.citations.includes(item.index)).map((item) => <li key={item.index} data-tone={edition.tones[citeKey(item)]}>
                        <h2><button type="button" aria-label={`Open Lean citation ${item.index}`} onClick={() => navigate(`@${citeKey(item)}`)}>[{item.index}]</button></h2>
                        <ul>
                          {item.declarations.map((d) => <li key={d.fullName} data-glossary-name={d.fullName}
                            onMouseEnter={() => setLit([d.fullName])} onMouseLeave={() => setLit(null)}>
                            <button type="button" onClick={() => openDeclaration(d.fullName)}>
                              <span>{edition.glossary[d.fullName]}</span><code>{d.fullName}</code>
                            </button>
                          </li>)}
                        </ul>
                      </li>)}
                    </ol>
                    </section>)}
                    <NoteCredit>Lean names and signatures are from Physlib. Proof Reader used AI to draft the reading titles, match phrases and assign topics.</NoteCredit>
                  </>
                )}
              </div>}
              {(showGraph || combined) && (
                <div className="api-map__graph-window">
                  <DependencyMap maps={edition.maps} current={edition.path} tracker={tracker} home={indexRoute()}
                    id="pane-dependency-map" compact onFitHeight={combined ? setGraphFitHeight : undefined}
                    onMinimise={combined ? () => changeLayout(true) : undefined} />
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function PassageAnnotation({ note, paragraphId, edition, phrase, onPhrase }: {
  note: PassageNote; paragraphId: string; edition: Edition; phrase: Phrase; onPhrase(id: number): void;
}) {
  const first = Number(paragraphId.slice(2));
  const source = `${sourceOf(edition, edition.file, first)}-L${note.endLine}`;
  return (
    <section className="api-map__annotation" aria-labelledby="api-map-annotation-title">
      <h2 id="api-map-annotation-title">{note.title}</h2>
      <blockquote>
        <button type="button" className="api-map__said-quote" data-tone={phrase.tone}
          title="Show this phrase in the map" onClick={() => onPhrase(phrase.id)}
          dangerouslySetInnerHTML={{ __html: phrase.html }} />
        <a href={source}>API map, lines {first}–{note.endLine}</a>
      </blockquote>
      <div dangerouslySetInnerHTML={{ __html: note.html }} />
      <NoteCredit>AI drafted this note for Proof Reader.</NoteCredit>
    </section>
  );
}

function BibliographyReference({ reference }: { reference: Reference }) {
  return (
    <div className="api-map__aside-note">
      <p>{reference.text.replace(/\s*— Physlib\/.*|\s*,?\s*https?:\/\/\S+$/, "")}</p>
      <a href={reference.apiMap ? `${tracker}#${reference.apiMap}` : reference.text.match(/https?:\/\/\S+$/)?.[0]}>Open reference</a>
    </div>
  );
}

function Code({ source, active }: { source: string; active?: number }) {
  const lines = useFileLines(source.replace(/\n$/, ""));
  return <LeanCode lines={lines} from={1} to={lines.length} numbers={active !== undefined} exact={active ? [active, active] : null} />;
}

function PhraseQuotes({ phrases, onPhrase }: { phrases: Phrase[]; onPhrase(id: number): void }) {
  if (!phrases.length) return null;
  return (
    <div className="api-map__said">
      <p className="api-map__said-label">In the map</p>
      {phrases.map((phrase) => (
        <button key={phrase.id} type="button" className="api-map__said-quote" data-tone={phrase.tone} title="Show this phrase in the map"
          aria-label={`Show the phrase “${phrase.quote}” in the map`} onClick={() => onPhrase(phrase.id)}>
          <span dangerouslySetInnerHTML={{ __html: phrase.html }} />
        </button>
      ))}
    </div>
  );
}

function DeclarationCard({ decl, title, tone, phrases, note, onPhrase, onLight, onSource, sourceUrl }: {
  decl: MapDeclaration; title: string; tone: number; phrases: Phrase[]; note?: string; onPhrase(id: number): void; onLight(on: boolean): void; onSource(): void; sourceUrl: string;
}) {
  return (
    <section className="step-proof api-map__declaration" data-lean-name={decl.fullName} data-tone={tone} tabIndex={-1}
      onMouseEnter={() => onLight(true)} onMouseLeave={() => onLight(false)}>
      <h2>{title}</h2>
      <p className="api-map__raw-name"><code>{decl.fullName}</code></p>
      <PhraseQuotes phrases={phrases} onPhrase={onPhrase} />
      {note && <div className="api-map__note">
        <p dangerouslySetInnerHTML={{ __html: note }} />
        <NoteCredit>AI drafted this note for Proof Reader.</NoteCredit>
      </div>}
      {decl.doc && <div className="api-map__docstring">
        <p className="api-map__said-label">Docstring in Physlib</p>
        <p className="api-map__doc"><Doc text={decl.doc} /></p>
      </div>}
      {(decl.source || decl.signature) && (
        <div className="decl__code api-map__signature" tabIndex={0} aria-label={decl.source ? "Lean declaration" : "Lean signature"}>
          {!decl.source && decl.signature.includes("…") && <p className="api-map__excerpt">Signature excerpt</p>}
          <Code source={decl.source ?? decl.signature} />
        </div>
      )}
      <div className="step-proof__meta">
        <button type="button" className="decl__copy" onClick={onSource}>View source at line {decl.line}</button>
        <a href={sourceUrl}>GitHub</a>
      </div>
    </section>
  );
}

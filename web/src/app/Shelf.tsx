// The front page. It opens on one real linked sentence beside the authors' Lean
// lines it is linked to (cut out by the build, see write_shelf in tools/paper.py),
// then says where each part of a page comes from, what the reader does, and which
// papers are in it. Nothing here knows about any one paper.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { tokenizeLean } from "../lean/leanTokens";
import { Lockup, SisterSites } from "./Family";
import { FilmSlot } from "./FilmSlot";
import { loadShelf, paperFile, type ShelfExample, type ShelfItem } from "./edition";
import { LONG_FILM, SHORT_FILM } from "./films";
import { routeHref } from "./router";
import { setScheme, useScheme } from "./theme";
import "./shelf.css";

const REPOSITORY = "https://github.com/wcook04/proof-reader";
const ADD_A_PAPER = `${REPOSITORY}/blob/main/skills/add-paper/SKILL.md`;

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const fileName = (path: string) => path.split("/").pop() ?? path;

export function Shelf() {
  const [papers, setPapers] = useState<ShelfItem[] | null>(null);
  const scheme = useScheme();
  useEffect(() => {
    document.title = "Proof Reader: read a paper beside its Lean proof";
    void loadShelf().then((s) => setPapers(s.papers), () => setPapers([]));
  }, []);
  const lead = papers?.find((p) => p.example) ?? papers?.[0];
  const example = lead?.example ?? null;
  return (
    <>
      <a className="skip" href="#papers" onClick={(event) => {
        event.preventDefault();
        document.querySelector<HTMLElement>(".shelf li a")?.focus();
      }}>Skip to the papers</a>
      <header className="bar bar--shelf">
        <div className="bar__left"><Lockup here /></div>
        <nav className="bar__right" aria-label="This page">
          <a className="bar__film" href={SHORT_FILM.youtube} target="_blank" rel="noopener noreferrer">
            <span className="bar__film-mark" aria-hidden="true" />Video, 1:30<span className="sr-only"> on YouTube</span>
          </a>
          <a className="bar__link bar__link--shelf" href={REPOSITORY}>Code on GitHub</a>
          <button type="button" className="bar__theme" aria-label={scheme === "dark" ? "Use the day theme" : "Use the night theme"} onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}>{scheme === "dark" ? "Day" : "Night"}</button>
        </nav>
      </header>
      <main className="shelf" id="main" tabIndex={-1}>
        <section className="hero">
          <div className="hero__words">
            <h1>A published paper beside its authors’ Lean&nbsp;proof</h1>
            <p className="hero__lede">Lean is a program that checks mathematical proofs. In Proof Reader, a click on a linked sentence of the paper opens the lines of Lean it is linked to, and a graph of the proof follows the reading.</p>
            <p className="hero__actions">
              {lead ? (
                <>
                  <a className="button button--ink" href={routeHref({ paper: lead.slug })}>Read {lead.short_title ?? "the paper"}</a>
                  {example && <a className="button button--ghost" href={routeHref({ paper: lead.slug, record: `@${example.id}` })}>Open one linked sentence</a>}
                </>
              ) : <span className="button button--ink button--held" aria-hidden="true">&nbsp;</span>}
            </p>
          </div>
          <div className="hero__specimen">
            {lead && example ? <Specimen paper={lead} example={example} /> : <div className="specimen specimen--held" aria-hidden="true" />}
            <div className="hero__films">
              <FilmSlot film={SHORT_FILM} size="inline" />
              <FilmSlot film={LONG_FILM} size="inline" text={false} />
            </div>
          </div>
        </section>

        <section className="band band--sources" aria-labelledby="sources-title">
          <div className="band__in">
            <h2 id="sources-title">Where each part of a page comes from</h2>
            <dl className="sources">
              <div>
                <dt>The authors</dt>
                <dd>The paper, in their own wording, with the original PDF one click away, and their Lean file, unchanged.</dd>
              </div>
              <div>
                <dt>Lean</dt>
                <dd>The lines of the graph and the list of axioms each proof uses, taken from Lean’s report on the authors’ compiled files.</dd>
              </div>
              <div className="sources__ai">
                <dt>AI, not reviewed by the authors</dt>
                <dd>The links between sentences and Lean, a short plain title for each declaration, and short notes where the paper and the Lean differ.</dd>
              </div>
            </dl>
            <p className="sources__limit">Lean checks the code. Whether a sentence and the code say the same thing is for a person to judge, and the reader puts the two side by side for that.</p>
          </div>
        </section>

        <section className="band band--reader" aria-labelledby="reader-title">
          <div className="band__in band__in--split">
            <div>
              <h2 id="reader-title">In the reader</h2>
              <ul className="facts">
                <li><strong>The graph follows the reading.</strong> Scrolling the paper moves the graph to the step linked to the passage on screen.</li>
                <li><strong>A click opens the Lean.</strong> Back returns to the same place in the paper.</li>
                <li><strong>Every linked statement has its own address,</strong> so one sentence and its Lean can be sent to someone.</li>
                <li><strong>An index lists each definition and theorem</strong> with the axioms its proof uses.</li>
              </ul>
            </div>
            {lead ? (
              <a className="reader-picture" href={routeHref({ paper: lead.slug })} aria-label={`Read ${lead.short_title ?? lead.title} in the reader`}>
                <img
                  src={`${import.meta.env.BASE_URL}${scheme === "dark" ? "reader-graph-night.webp" : "reader-graph-day.webp"}`}
                  alt="The reader: the paper on the left with one statement highlighted, and on the right the graph of the Lean proof with the linked step lit."
                  width={1600} height={900} loading="lazy" decoding="async"
                />
              </a>
            ) : <div className="reader-picture reader-picture--held" aria-hidden="true" />}
          </div>
        </section>

        <section className="band band--papers" id="papers" aria-labelledby="papers-title">
          <div className="band__in">
            <h2 id="papers-title">{papers && papers.length > 1 ? "Papers in the reader" : "The paper in the reader"}</h2>
            <ul className="shelf__list">
              {(papers ?? []).map((p) => (
                <li key={p.slug}>
                  <a href={routeHref({ paper: p.slug })}>
                    <img src={paperFile(p.slug, "first-page.png")} alt="" width={96} height={142} />
                    <span>
                      <span className="shelf__title">{p.title}</span>
                      <span className="shelf__by">{p.authors.join(", ")}</span>
                      <span className="shelf__by">{p.venue}</span>
                      {p.lean && (
                        <span className="shelf__by shelf__counts">
                          {count(p.lean.files, "Lean file")} of {count(p.lean.lines, "line")}, {count(p.declarations, "declaration")}{p.linked ? `, ${count(p.linked, "linked passage")}` : ""}
                        </span>
                      )}
                      <span className="shelf__status">The links from this paper to its proof in Lean, and the notes, were made with AI and have not been reviewed by the authors.</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="shelf__add">A paper with public Lean and an open licence can be added. <a href={ADD_A_PAPER}>The add-paper guide</a> has the procedure, and <a href={REPOSITORY}>the code is on GitHub</a>.</p>
          </div>
        </section>
        <footer className="shelf__foot"><SisterSites /></footer>
      </main>
    </>
  );
}

/** One sentence of the paper and its Lean lines, as the reader draws them, and a way in at that exact place. */
function Specimen({ paper, example }: { paper: ShelfItem; example: ShelfExample }) {
  const frame = useRef<HTMLDivElement>(null);
  const [thread, setThread] = useState<string | null>(null);
  const href = routeHref({ paper: paper.slug, record: `@${example.id}` });
  // The thread from the sentence to its lines, measured from where both were laid out.
  useLayoutEffect(() => {
    const box = frame.current;
    if (!box) return;
    const draw = () => {
      const quote = box.querySelector<HTMLElement>(".specimen__quote");
      const first = box.querySelector<HTMLElement>(".specimen__line.is-exact");
      const paperPane = box.querySelector<HTMLElement>(".specimen__paper");
      if (!quote || !first || !paperPane) return setThread(null);
      const origin = box.getBoundingClientRect();
      const rects = quote.getClientRects();
      const end = rects[rects.length - 1];
      const target = first.getBoundingClientRect();
      const pane = paperPane.getBoundingClientRect();
      // Stacked on a narrow screen: the two are not side by side, so no thread.
      if (!end || target.left < pane.right - 4) return setThread(null);
      const x0 = end.right - origin.left + 3;
      const y0 = end.top + end.height / 2 - origin.top;
      const x1 = target.left - origin.left;
      const y1 = target.top + target.height / 2 - origin.top;
      const mid = pane.right - origin.left - 14;
      setThread(`M${x0},${y0} H${mid - 10} Q${mid},${y0} ${mid},${y0 + Math.sign(y1 - y0) * 10} V${y1 - Math.sign(y1 - y0) * 10} Q${mid},${y1} ${mid + 10},${y1} H${x1}`);
    };
    draw();
    const watch = new ResizeObserver(draw);
    watch.observe(box);
    void document.fonts?.ready.then(draw);
    return () => watch.disconnect();
  }, [example]);
  return (
    <figure className="specimen" ref={frame}>
      <div className="specimen__paper">
        <p className="specimen__label">{paper.short_title ?? paper.title}, §{example.section}, page {example.page_label}</p>
        <p className="specimen__text">
          {example.before}
          <a className="specimen__quote" href={href} title="Open this sentence and its Lean in the reader">{example.quote}</a>
          {example.after}
        </p>
      </div>
      <div className="specimen__lean">
        <p className="specimen__label">The authors’ Lean, {fileName(example.file)}</p>
        <p className="specimen__decl">
          <span className="specimen__plain">{example.plain}</span>
          <code>{example.name}</code>
          <span className="specimen__where">{example.keyword}, lines {example.decl_first} to {example.decl_last}</span>
        </p>
        <pre className="lean-code specimen__code">
          {example.code.map((line) => {
            const indent = /^ */.exec(line.text)?.[0].length ?? 0;
            return (
              <span key={line.n} className={`specimen__line${line.n >= example.first && line.n <= example.last ? " is-exact" : ""}`}>
                <span className="specimen__no" aria-hidden="true">{line.n}</span>
                <span className="specimen__src" style={{ "--indent": indent } as CSSProperties}>
                  {tokenizeLean(line.text).map((token, i) => {
                    if (token.kind === "space" || token.kind === "punct") return token.text;
                    const typed = token.kind === "ident" && /^[A-Z]/.test(token.text);
                    return <span key={i} className={`lk lk--${typed ? "type" : token.kind}`}>{token.text}</span>;
                  })}
                  {"\n"}
                </span>
              </span>
            );
          })}
        </pre>
      </div>
      {thread && (
        <svg className="specimen__thread" aria-hidden="true">
          <path d={thread} />
          <circle r="3.5" cx={thread.slice(1).split(/[ ,H]/)[0]} cy={thread.slice(1).split(/[ ,H]/)[1]} />
        </svg>
      )}
      <figcaption className="specimen__caption">
        The highlighted sentence is linked to lines {example.first} to {example.last} of the authors’ Lean. <a href={href}>Open it in the reader</a>
      </figcaption>
    </figure>
  );
}

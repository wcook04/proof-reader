// The right-hand page: the authors' Lean file, with the declaration being read
// lined up beside its sentence. Above it, what Lean reports about that
// declaration and any note, kept short so the file stays the subject.

import { useEffect, useMemo, useRef } from "react";
import type { Declaration, Edition } from "../app/edition";
import { READING_LINE } from "../paper/PdfPane";
import { tokenizeLean } from "./leanTokens";

const KIND_WORDS: Record<string, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  def: "Definition",
  abbrev: "Definition",
  instance: "Instance",
  axiom: "Axiom",
  inductive: "Type",
  structure: "Type",
  class: "Type class",
  opaque: "Definition",
};

interface Props {
  edition: Edition;
  selected: string | null;
  /** Every declaration the passage being read is about. */
  reading: string[];
  onSelect(id: string): void;
  onPassage(id: string): void;
  /** Present when the reader came here from the map. */
  onBack?(): void;
}

export function LeanPane({ edition, selected, reading, onSelect, onPassage, onBack }: Props) {
  const declaration = edition.declarations.find((d) => d.id === selected) ?? edition.declarations.find((d) => reading.includes(d.id)) ?? null;
  const file = declaration?.file ?? Object.keys(edition.lean.files)[0];
  const lit = useMemo(() => edition.declarations.filter((d) => reading.includes(d.id) && d.file === file), [edition, file, reading]);
  return (
    <aside className="leaf" aria-label="Lean">
      <div className="leaf__head">
        {onBack && <button type="button" className="leaf__back" onClick={onBack}>Back to the map</button>}
        {declaration ? <Head edition={edition} d={declaration} onSelect={onSelect} onPassage={onPassage} /> : <h2 className="leaf__name">{file}</h2>}
      </div>
      <Source text={edition.lean.files[file]} name={file} focus={declaration} lit={lit} known={edition.declarations} onSelect={onSelect} />
    </aside>
  );
}

function Head({ edition, d, onSelect, onPassage }: { edition: Edition; d: Declaration; onSelect(id: string): void; onPassage(id: string): void }) {
  const isProof = d.keyword === "theorem" || d.keyword === "lemma";
  const pages = d.passages.map((id) => edition.passages.find((p) => p.id === id)).filter((p) => !!p);
  return (
    <>
      <h2 className="leaf__name">
        {d.id}
        <span>{KIND_WORDS[d.keyword] ?? d.keyword}, lines {d.line} to {d.end_line}</span>
      </h2>
      {d.keyword === "axiom" && <p className="leaf__line leaf__axiom">Assumed, not proved. Lean takes this as given.</p>}
      {isProof && (
        <p className="leaf__line">
          {d.axioms.length ? (
            <>
              Lean reports this rests on{" "}
              {d.axioms.map((a) => (
                <button key={a} type="button" className="jump leaf__axiom" onClick={() => onSelect(a)}><code>{a}</code></button>
              ))}
            </>
          ) : (
            <>Lean reports this uses none of the authors' axioms.</>
          )}
        </p>
      )}
      {d.note && <p className="leaf__note">{d.note.text}</p>}
      {pages.length > 1 && (
        <p className="leaf__line">
          {pages.length} places in the paper, on page{" "}
          {pages.map((p) => (
            <button key={p.id} type="button" className="jump" onClick={() => onPassage(p.id)}>{p.page}</button>
          ))}
        </p>
      )}
    </>
  );
}

interface Piece {
  text: string;
  kind: string;
}

/** Split a file into lines of tokens, setting the authors' comments apart from code. */
function lineTokens(text: string): Piece[][] {
  let inBlock = false;
  return text.split("\n").map((line) => {
    const pieces: Piece[] = [];
    let rest = line;
    while (rest) {
      if (inBlock) {
        const close = rest.indexOf("-/");
        const end = close < 0 ? rest.length : close + 2;
        pieces.push({ text: rest.slice(0, end), kind: "prose" });
        rest = rest.slice(end);
        if (close >= 0) inBlock = false;
        continue;
      }
      const block = rest.indexOf("/-");
      const dash = rest.indexOf("--");
      const start = block >= 0 && (dash < 0 || block < dash) ? block : dash;
      const code = start < 0 ? rest : rest.slice(0, start);
      if (code) for (const token of tokenizeLean(code)) pieces.push({ text: token.text, kind: token.kind });
      if (start < 0) break;
      rest = rest.slice(start);
      if (start === dash && (block < 0 || dash < block)) {
        pieces.push({ text: rest, kind: "comment" });
        break;
      }
      inBlock = true;
      pieces.push({ text: rest.slice(0, 2), kind: "prose" });
      rest = rest.slice(2);
    }
    return pieces;
  });
}

interface SourceProps {
  name: string;
  text: string;
  focus: Declaration | null;
  lit: Declaration[];
  known: Declaration[];
  onSelect(id: string): void;
}

function Source({ name, text, focus, lit, known, onSelect }: SourceProps) {
  const lines = useMemo(() => tokenLines(text), [text]);
  const names = useMemo(() => new Set(known.map((d) => d.id)), [known]);
  const body = useRef<HTMLDivElement>(null);

  // Bring the declaration level with the paper's reading line, so the sentence
  // and its Lean sit side by side.
  useEffect(() => {
    if (!focus) return;
    const el = body.current;
    const row = el?.querySelector<HTMLElement>(`[data-line="${focus.line}"]`);
    const paper = document.querySelector<HTMLElement>(".pdf");
    if (!el || !row || !paper) return;
    const align = (behavior: ScrollBehavior) => {
      const line = paper.getBoundingClientRect().top + paper.clientHeight * READING_LINE;
      el.scrollTo({ top: row.offsetTop - (line - el.getBoundingClientRect().top) + 11, behavior });
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    align(reduced ? "auto" : "smooth");
    // The code font can arrive after this and rewrap the lines, so level up again.
    let live = true;
    void document.fonts.ready.then(() => live && align("auto"));
    const observer = new ResizeObserver(() => align("auto"));
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [focus]);

  return (
    <div className="source__body" ref={body} tabIndex={0} aria-label={`Lean source, ${name}`}>
      <code className="lean-code">
        {lines.map((pieces, index) => {
          const line = index + 1;
          const within = (d: Declaration) => line >= d.line && line <= d.end_line;
          const on = lit.some(within) ? " is-on" : "";
          const isFocus = focus && within(focus) ? " is-on" : "";
          return (
            <span key={line} className={`source__line${on || isFocus}`} data-line={line}>
              <span className="source__no" aria-hidden="true">{line}</span>
              <span className="source__text">
                {pieces.map((piece, i) =>
                  names.has(piece.text) ? (
                    <button key={i} type="button" className={`source__ref${piece.text === focus?.id ? " is-self" : ""}`} onClick={() => onSelect(piece.text)}>
                      {piece.text}
                    </button>
                  ) : piece.kind === "space" || piece.kind === "punct" ? (
                    piece.text
                  ) : (
                    <span key={i} className={`lk lk--${piece.kind}`}>{piece.text}</span>
                  ),
                )}
                {"\n"}
              </span>
            </span>
          );
        })}
      </code>
    </div>
  );
}

const tokenLines = lineTokens;

// The right-hand page: the authors' Lean file, with the declaration being read
// lined up beside its sentence. Above it, what Lean reports about that
// declaration and any note, kept short so the file stays the subject.

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { Declaration, Edition } from "../app/edition";
import { isType } from "../model/fromEdition";
import { READING_LINE } from "../paper/reading-line";
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
  /** The exact lines the sentence being read describes, when it names them. */
  exact: [number, number] | null;
  /** A line for the reader above the Lean: how to begin, or that nothing here is tied. */
  notice: string | null;
  /** Present when the reader came here from the map. */
  onBack?(): void;
}

export function LeanPane({ edition, selected, reading, exact, notice, onSelect, onPassage, onBack }: Props) {
  const declaration = edition.declarations.find((d) => d.id === selected) ?? edition.declarations.find((d) => reading.includes(d.id)) ?? null;
  const file = declaration?.file ?? Object.keys(edition.lean.files)[0];
  const lit = useMemo(() => edition.declarations.filter((d) => reading.includes(d.id) && d.file === file), [edition, file, reading]);
  return (
    <aside className="leaf" aria-label="Lean">
      <div className="leaf__head">
        {onBack && <button type="button" className="leaf__back" onClick={onBack}>Back to the map</button>}
        {notice && !onBack && <p className="leaf__notice">{notice}</p>}
        {declaration ? <Head edition={edition} d={declaration} onSelect={onSelect} onPassage={onPassage} /> : <h2 className="leaf__name">{file}</h2>}
      </div>
      <Source text={edition.lean.files[file]} name={file} focus={declaration} lit={lit} exact={exact} known={edition.declarations} onSelect={onSelect} />
    </aside>
  );
}

function Head({ edition, d, onSelect, onPassage }: { edition: Edition; d: Declaration; onSelect(id: string): void; onPassage(id: string): void }) {
  const isProof = d.keyword === "theorem" || d.keyword === "lemma";
  const passages = d.passages.map((id) => edition.passages.find((p) => p.id === id)).filter((p) => !!p);
  const pages = passages.filter((p, index) => passages.findIndex((other) => other.page === p.page) === index);
  const severalFiles = Object.keys(edition.lean.files).length > 1;
  return (
    <>
      <h2 className="leaf__name">
        {d.id}
        <span>{KIND_WORDS[d.keyword] ?? d.keyword}, {severalFiles ? `${d.file.split("/").pop()}, ` : ""}lines {d.line} to {d.end_line}</span>
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
            <>Lean reports this uses none of the authors’ axioms.</>
          )}
        </p>
      )}
      {d.note && <p className="leaf__note">{d.note.text}</p>}
      {!isType(d) && d.used_by.length > 0 && (
        <p className="leaf__line leaf__more">
          Used by{" "}
          {d.used_by.map((name) => (
            <button key={name} type="button" className="jump" onClick={() => onSelect(name)}><code>{name}</code></button>
          ))}
        </p>
      )}
      {pages.length > 1 && (
        <p className="leaf__line leaf__more">
          In the paper at{" "}
          {pages.map((p) => (
            <button key={p.id} type="button" className="jump" onClick={() => onPassage(p.id)}>page {p.page}</button>
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
  exact: [number, number] | null;
  known: Declaration[];
  onSelect(id: string): void;
}

function Source({ name, text, focus, lit, exact, known, onSelect }: SourceProps) {
  const lines = useMemo(() => tokenLines(text), [text]);
  const names = useMemo(() => new Set(known.map((d) => d.id)), [known]);
  const body = useRef<HTMLDivElement>(null);

  // Bring the declaration level with the paper's reading line, so the sentence
  // and its Lean sit side by side.
  useEffect(() => {
    if (!focus) return;
    const el = body.current;
    const row = el?.querySelector<HTMLElement>(`[data-line="${exact ? exact[0] : focus.line}"]`);
    const paper = document.querySelector<HTMLElement>("[data-paper-pane]");
    if (!el || !row || !paper) return;
    const align = (behavior: ScrollBehavior) => {
      const line = paper.getBoundingClientRect().top + paper.clientHeight * READING_LINE;
      // Level with the paper's reading line where that falls inside this pane; a tall
      // head or a stacked phone layout can put it above, and the code must still show.
      const room = Math.max(14, Math.min(line - el.getBoundingClientRect().top, el.clientHeight * 0.6));
      el.scrollTo({ top: row.offsetTop - room + 11, behavior });
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
  }, [exact, focus]);

  return (
    <div className="source__body" ref={body} tabIndex={0} aria-label={`Lean source, ${name}`}>
      <code className="lean-code">
        {lines.map((pieces, index) => {
          const line = index + 1;
          const within = (d: Declaration) => line >= d.line && line <= d.end_line;
          const on = lit.some(within) ? " is-on" : "";
          const isFocus = focus && within(focus) ? " is-on" : "";
          const isExact = exact && line >= exact[0] && line <= exact[1] ? " is-exact" : "";
          // A long line wraps under its own code, so nesting stays readable.
          const indent = /^ */.exec(pieces.map((piece) => piece.text).join(""))?.[0].length ?? 0;
          return (
            <span key={line} className={`source__line${on || isFocus}${isExact}`} data-line={line}>
              <span className="source__no" aria-hidden="true">{line}</span>
              <span className="source__text" style={{ "--indent": indent } as CSSProperties}>
                {pieces.map((piece, i) => {
                  // Types take one colour on both pages, so the same name reads the same.
                  const typed = piece.kind === "ident" && /^[A-Z]/.test(piece.text);
                  if (names.has(piece.text)) {
                    return (
                      <button key={i} type="button" className={`source__ref${typed ? " lk--type" : ""}${piece.text === focus?.id ? " is-self" : ""}`} onClick={() => onSelect(piece.text)}>
                        {piece.text}
                      </button>
                    );
                  }
                  if (piece.kind === "space" || piece.kind === "punct") return piece.text;
                  return <span key={i} className={`lk lk--${typed ? "type" : piece.kind}`}>{piece.text}</span>;
                })}
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

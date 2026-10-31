// The paper's sections down the left of the desk, with the one being read marked
// and each section's count of sentences tied to the Lean. Above them, a search of
// the paper's text and the Lean's names, read from the page already in the browser.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Declaration, OutlineEntry } from "../app/edition";

interface Props {
  outline: OutlineEntry[];
  current: string | null;
  words: number;
  /** On a narrow screen the list opens over the page. */
  open: boolean;
  declarations: Declaration[];
  /** The page is in the browser, so its text can be searched. */
  ready: boolean;
  onJump(id: string): void;
  onTop(): void;
  onName(name: string): void;
  onPdf(): void;
}

interface Block {
  element: HTMLElement;
  text: string;
  section: string;
}

interface Found {
  block: Block;
  at: number;
}

const LIMIT = 24;
const BLOCKS = ".sheet__text p, .sheet__text li, .sheet__text pre, .sheet__text figcaption, .sheet__text aside, .sheet__text h2, .sheet__text h3";

/** The page's blocks, each with the section it falls under. */
function readBlocks(outline: OutlineEntry[]): Block[] {
  const label = new Map(outline.map((e) => [e.id, e.number ? `Section ${e.number}` : e.title]));
  const blocks: Block[] = [];
  let section = "Title and abstract";
  document.querySelectorAll<HTMLElement>(BLOCKS).forEach((element) => {
    if (element.closest(".inset")) return;
    if (/^H[23]$/.test(element.tagName)) section = label.get(element.id) ?? section;
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".pg, .katex-html").forEach((part) => part.remove());
    const text = copy.textContent ?? "";
    if (text.trim()) blocks.push({ element, text: text.replace(/\s+/g, " "), section });
  });
  return blocks;
}

function Snippet({ text, at, length }: { text: string; at: number; length: number }) {
  const from = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 28)));
  const to = Math.min(text.length, at + length + 44);
  return (
    <>
      {from > 0 && "…"}
      {text.slice(from, at)}
      <mark>{text.slice(at, at + length)}</mark>
      {text.slice(at + length, to)}
      {to < text.length && "…"}
    </>
  );
}

export function Contents({ outline, current, words, open, declarations, ready, onJump, onTop, onName, onPdf }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const blocks = useRef<Block[]>([]);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  // Keep the current entry in view inside the column, without moving the page.
  useEffect(() => {
    const el = list.current;
    const item = el?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!el || !item) return;
    const top = item.offsetTop - el.offsetTop;
    if (top < el.scrollTop + 24 || top > el.scrollTop + el.clientHeight - 48) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [current]);

  useEffect(() => {
    if (ready) blocks.current = readBlocks(outline);
  }, [outline, ready]);

  // Slash starts a search, as on most reading sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest?.("input, textarea");
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const names = useMemo(() => (needle ? declarations.filter((d) => d.id.toLowerCase().includes(needle)).slice(0, 6) : []), [declarations, needle]);

  const found = useMemo(() => {
    if (needle.length < 2) return [];
    if (!blocks.current.length) blocks.current = readBlocks(outline);
    const hits: Found[] = [];
    for (const block of blocks.current) {
      const at = block.text.toLowerCase().indexOf(needle);
      if (at >= 0) hits.push({ block, at });
      if (hits.length === LIMIT) break;
    }
    return hits;
  }, [needle, outline]);

  const go = (block: Block) => {
    const pane = document.querySelector<HTMLElement>("[data-paper-pane]");
    if (!pane) return;
    const top = block.element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTo({ top: top - pane.clientHeight * 0.3, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <nav className={`rail${open ? " is-open" : ""}`} aria-label="Sections of this paper">
      <div className="rail__search" role="search">
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search the paper and Lean"
          aria-label="Search the paper and the Lean names"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      {needle ? (
        names.length + found.length === 0 ? (
          <p className="rail__none">Nothing matches that.</p>
        ) : (
          <ul className="rail__found">
            {names.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => onName(d.id)}>
                  <code>{d.id}</code>
                  <span className="rail__where">Lean, line {d.line}</span>
                </button>
              </li>
            ))}
            {found.map(({ block, at }) => (
              <li key={`${block.section}${at}${block.text.slice(0, 24)}`}>
                <button type="button" onClick={() => go(block)}>
                  <Snippet text={block.text} at={at} length={needle.length} />
                  <span className="rail__where">{block.section}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ol className="rail__list" ref={list}>
          <li>
            <button type="button" className="rail__item" aria-current={current === null ? "location" : undefined} onClick={onTop}>
              <span className="rail__title">Title and abstract</span>
            </button>
          </li>
          {outline.map((entry) => (
            <li key={entry.id} className={entry.level === 3 ? "rail__sub" : ""}>
              <button type="button" className="rail__item" aria-current={entry.id === current ? "location" : undefined} onClick={() => onJump(entry.id)}>
                {entry.number && <span className="rail__no">{entry.number}</span>}
                <span className="rail__title">{entry.title}</span>
                {entry.ties > 0 && <span className="rail__ties" title={`${entry.ties} sentences and lines of code tied to the Lean`}>{entry.ties}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="rail__key">
        <span className="rail__ties">Amber</span> counts sentences and code lines tied to the Lean. A program matched all {words.toLocaleString("en-GB")} words here against the authors' PDF.{" "}
        <button type="button" onClick={onPdf}>See the PDF</button>
      </p>
    </nav>
  );
}

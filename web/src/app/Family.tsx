// What every one of Will Cook's websites carries (docs/family.md in
// wcook04.github.io), adapted from Lean Exposition's TopBar and SisterSites: the
// lockup at the start of the header, and the other sites in the footer.

import { useId, useRef, type ReactNode } from "react";
import { hasComparisons, noun, paperFile, type Edition } from "./edition";
import family from "./family.json";
import { routeHref } from "./router";

const THIS_SITE = "proof-reader";

export function Lockup({ here = false }: { here?: boolean }) {
  return (
    <span className="fam-lockup">
      <OwnerLink />
      <span className="fam-lockup__rule" aria-hidden="true" />
      <a className="fam-lockup__site" href={routeHref({})} aria-label="Proof Reader, all papers" title="Proof Reader, all papers" aria-current={here ? "page" : undefined}>
        <BookMark />
        <span className="fam-lockup__name" translate="no">Proof Reader</span>
      </a>
    </span>
  );
}

export function OwnerLink() {
  return (
    <a className="fam-lockup__home" href={family.owner.home} title="All of Will Cook's projects and videos">
      <img src={`${import.meta.env.BASE_URL}plectis.svg`} alt="" width={26} height={26} />
      <span className="fam-lockup__owner" translate="no">Will Cook</span>
    </a>
  );
}

const PAPER_MARKS: Record<string, string> = {
  "contextual-embeddings": "contextual-embeddings",
  "coupled-spring": "coupled-spring",
  "pcp-exposition": "pcp",
  "pcp-full-argument": "pcp",
  "pcp-reading-guide": "pcp",
  "pcp-specialist": "pcp",
  "physlib-gauge-theory": "physlib-gauge-theory",
  "smtlib-2-7": "smtlib",
};

export function ReaderMark({ paper }: { paper: string }) {
  const mark = PAPER_MARKS[paper];
  return mark ? <span className="bar__paper-mark" aria-hidden="true" data-paper-mark={mark}
    style={{ maskImage: `url(${import.meta.env.BASE_URL}mark-${mark}.svg)` }} /> : null;
}

/** The Reading library's index. A reader's wordmark at the start of its bar opens it. */
export const LIBRARY_HOME = "https://wcook04.github.io/library/";

/** The reader bar's wordmark: the Reading library, shortened to "Library" on phones. The menu keeps "All editions". */
export function ReaderHome() {
  return (
    <a className="bar__reader-home bar__library" href={LIBRARY_HOME}>
      <span className="bar__library-long">Reading library</span>
      <span className="bar__library-short">Library</span>
    </a>
  );
}

export function SourceCredit({ children }: { children: ReactNode }) {
  return <aside className="reader-source" aria-label="Sources and credit"><p>{children}</p></aside>;
}

export function PaperSourceCredit({ edition }: { edition: Edition }) {
  const { paper, lean, source, credit } = edition;
  const markdown = source?.kind === "markdown";
  const original = credit?.original_url;
  const textSource = paper.url || (paper.pdf ? paperFile(edition.slug, "paper.pdf") : undefined);
  const additions = hasComparisons(edition) ? "links, plain titles, notes and comparisons" : "links, plain titles and notes";
  return (
    <SourceCredit>
      {original && <><a href={original}>Original paper</a>{" · "}</>}
      {textSource && textSource !== original && <><a href={textSource}>
        {markdown ? "Source Markdown" : `Original ${noun(edition)}`}
      </a>{" · "}</>}
      <a href={lean.source}>Lean source</a>
      {paper.licence_url && <>{" · "}<a href={paper.licence_url}>Licence</a></>}.
      {" "}{markdown && credit?.text
        ? `${credit.text}.`
        : `By ${paper.authors.join(", ")}. Proof Reader added the ${additions} with AI assistance.`}
    </SourceCredit>
  );
}

export function ReaderMenu({ children, onOpen }: { children: ReactNode; onOpen(): void }) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  return (
    <>
      <button type="button" className="bar__menu" aria-label="Site menu" popoverTarget={id}
        onClick={() => { if (!panel.current?.matches(":popover-open")) onOpen(); }}>Menu</button>
      <nav ref={panel} id={id} className="reader-menu" aria-label="Site menu" popover="auto" onClick={(event) => {
        if ((event.target as Element).closest("a, button")) panel.current?.hidePopover();
      }}>{children}</nav>
    </>
  );
}

/** The open book of the favicon, drawn from the page's inks so it follows the theme switch. */
function BookMark() {
  return (
    <svg className="bookmark" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <path d="M16 8 C12 5.5 7 5 3 6 V26 C7 25 12 25.5 16 28 C20 25.5 25 25 29 26 V6 C25 5 20 5.5 16 8 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 8 V28 M7 12 H12.5 M7 20 H12.5 M19.5 12 H25 M19.5 20 H25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 16 H12.5 M19.5 16 H25" fill="none" stroke="var(--lit)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** The footer's list, the same on every site of the family: this one marked, not removed. */
export function SisterSites() {
  return (
    <nav className="fam-sites" aria-label={`${family.owner.name}'s websites`}>
      <p className="fam-sites__title">More from {family.owner.name}</p>
      <ul className="fam-sites__list">
        {family.sites.map((site) => (
          <li key={site.id}>
            <a href={site.id === THIS_SITE ? routeHref({}) : site.url} aria-current={site.id === THIS_SITE ? "page" : undefined}>{site.name}</a>
          </li>
        ))}
        <li>
          <a href={family.owner.home}>All projects and videos</a>
        </li>
      </ul>
    </nav>
  );
}

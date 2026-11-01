// What every one of Will Cook's websites carries (docs/family.md in
// wcook04.github.io), adapted from Lean Exposition's TopBar and SisterSites: the
// lockup at the start of the header, and the other sites in the footer.

import family from "./family.json";
import { routeHref } from "./router";

const THIS_SITE = "proof-reader";

export function Lockup({ here = false }: { here?: boolean }) {
  return (
    <span className="fam-lockup">
      <a className="fam-lockup__home" href={family.owner.home} rel="author" title="All of Will Cook's websites and films">
        <img src={`${import.meta.env.BASE_URL}plectis.svg`} alt="Will Cook: all websites and films" width={26} height={26} />
      </a>
      <span className="fam-lockup__rule" aria-hidden="true" />
      <a className="fam-lockup__site" href={routeHref({})} aria-label="Proof Reader, all papers" aria-current={here ? "page" : undefined}>
        <BookMark />
        <span className="fam-lockup__name" translate="no">Proof Reader</span>
      </a>
    </span>
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

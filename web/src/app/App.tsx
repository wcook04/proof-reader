import { useEffect, useState } from "react";
import { PaperPage } from "../paper/PaperPage";
import { Lockup, SisterSites } from "./Family";
import { loadEdition, loadShelf, paperFile, type Edition, type ShelfItem } from "./edition";
import { readRoute, routeHref, type Route } from "./router";

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => {
      const next = readRoute();
      // A paper's page follows its own address; only a change of paper lands here.
      setRoute((was) => (was.paper === next.paper ? was : next));
    };
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  return route.paper ? <Loaded key={route.paper} slug={route.paper} /> : <Shelf />;
}

function Loaded({ slug }: { slug: string }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadEdition(slug).then((e) => {
      if (!live) return;
      setEdition(e);
      document.title = `${e.paper.short_title}, read beside its Lean proof · Proof Reader`;
    }, () => {
      if (!live) return;
      setFailed(true);
      document.title = "No such paper · Proof Reader";
    });
    return () => {
      live = false;
    };
  }, [slug]);
  if (failed) return (
    <>
      <header className="bar"><div className="bar__left"><Lockup /></div></header>
      <div className="lost"><h1>There is no paper at this address.</h1><p><a href={routeHref({})}>See all papers</a></p></div>
    </>
  );
  if (!edition) return <p className="status">Opening the paper…</p>;
  return <PaperPage edition={edition} />;
}

function Shelf() {
  const [papers, setPapers] = useState<ShelfItem[]>([]);
  useEffect(() => {
    document.title = "Proof Reader: read a paper beside its Lean proof";
    void loadShelf().then((s) => setPapers(s.papers));
  }, []);
  return (
    <>
    <a className="skip" href="#papers" onClick={(event) => {
      event.preventDefault();
      document.querySelector<HTMLElement>(".shelf li a")?.focus();
    }}>Skip to the papers</a>
    <header className="bar"><div className="bar__left"><Lockup here /></div></header>
    <main className="shelf" id="papers" tabIndex={-1}>
      <div className="shelf__in">
        <div>
          <h1>Proof Reader</h1>
          <p className="shelf__lede">Proof Reader shows a research paper beside its proof in Lean, a programming language whose compiler rejects a proof with a wrong step. As you scroll the paper, a graph of the proof moves to the statement you are reading. Click a statement to read the authors’ exact Lean lines, and press Back to return to your place.</p>
          <ul>
            {papers.map((p) => (
              <li key={p.slug}>
                <a href={routeHref({ paper: p.slug })}>
                  <img src={paperFile(p.slug, "first-page.png")} alt="" width={96} height={142} />
                  <span>
                    <span className="shelf__title">{p.title}</span>
                    <span className="shelf__by">{p.authors.join(", ")}</span>
                    <span className="shelf__by">{p.venue}</span>
                    <span className="shelf__status">The links from this paper to its proof in Lean, and the notes, were made with AI and have not been reviewed by the authors.</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <img
          className="shelf__picture"
          src={`${import.meta.env.BASE_URL}reader.webp`}
          alt="A paper on the left page with one sentence highlighted, and on the right the Lean lines linked to that sentence."
          width={1600}
          height={840}
        />
      </div>
      <footer className="shelf__foot"><SisterSites /></footer>
    </main>
    </>
  );
}

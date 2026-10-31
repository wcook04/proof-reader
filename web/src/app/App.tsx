import { useEffect, useState } from "react";
import { PaperPage } from "../paper/PaperPage";
import { loadEdition, loadShelf, type Edition, type ShelfItem } from "./edition";
import { readRoute, routeHref, type Route } from "./router";

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route.paper ? <Loaded key={route.paper} slug={route.paper} record={route.record} /> : <Shelf />;
}

function Loaded({ slug, record }: { slug: string; record?: string }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadEdition(slug).then((e) => {
      setEdition(e);
      document.title = `${e.paper.short_title} · Proof Reader`;
    }, () => setFailed(true));
  }, [slug]);
  if (failed) return <p className="status">There is no paper here. <a href={routeHref({})}>See all papers</a></p>;
  if (!edition) return <p className="status">Opening the paper…</p>;
  return <PaperPage edition={edition} record={record} />;
}

function Shelf() {
  const [papers, setPapers] = useState<ShelfItem[]>([]);
  useEffect(() => {
    document.title = "Proof Reader";
    void loadShelf().then((s) => setPapers(s.papers));
  }, []);
  return (
    <main className="shelf">
      <h1>Proof Reader</h1>
      <p className="shelf__lede">Read a paper beside its Lean proof: the authors' own PDF, a map of the Lean, and the source, tied together passage by passage.</p>
      <ul>
        {papers.map((p) => (
          <li key={p.slug}>
            <a href={routeHref({ paper: p.slug })}>
              <span className="shelf__title">{p.title}</span>
              <span className="shelf__by">{p.authors.join(", ")}</span>
              <span className="shelf__by">{p.venue} · {p.declarations} Lean declarations</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

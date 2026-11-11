import { useEffect, useState } from "react";
import { PaperPage } from "../paper/PaperPage";
import { Lockup } from "./Family";
import { Shelf } from "./Shelf";
import { loadEdition, type Edition } from "./edition";
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

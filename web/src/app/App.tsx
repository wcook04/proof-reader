import { lazy, Suspense, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { PaperPage } from "../paper/PaperPage";
import { StatementSheet } from "../paper/StatementSheet";
import { Lockup } from "./Family";
import { Shelf } from "./Shelf";
import { loadEdition, type Edition } from "./edition";
import { PHYSLIB_MAP, readRoute, routeHref, type Route } from "./router";

const PhyslibMap = lazy(() => import("../api/PhyslibMap").then((module) => ({ default: module.PhyslibMap })));

/** The last address App saw, to tell a move to or from the statement sheet. */
let readRouteCache: Route = readRoute();

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => {
      const next = readRoute();
      // A paper's page follows its own address; only a change of paper lands here.
      // The statement sheet is a page of its own, so moving to or from it lands here too,
      // as a view transition where the browser has one and the reader has not asked for less motion.
      const update = () => setRoute((was) => (was.paper === next.paper && (was.record === "@sheet") === (next.record === "@sheet") ? was : next));
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      const sheetMove = (readRouteCache.record === "@sheet") !== (next.record === "@sheet") && readRouteCache.paper === next.paper;
      readRouteCache = next;
      if (sheetMove && doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(() => flushSync(update));
      else update();
    };
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  if (route.paper === PHYSLIB_MAP) return (
    <Suspense fallback={<p className="status">Opening the Physlib API map…</p>}>
      <PhyslibMap />
    </Suspense>
  );
  return route.paper ? <Loaded key={route.paper} slug={route.paper} sheet={route.record === "@sheet"} /> : <Shelf />;
}

function Loaded({ slug, sheet }: { slug: string; sheet: boolean }) {
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
  if (sheet && edition.sheets?.length) return <StatementSheet edition={edition} />;
  return <PaperPage edition={edition} />;
}

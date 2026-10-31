// Addresses live after the # so the site works from any folder on a static
// host. #/paper opens a paper, #/paper/name a Lean declaration, and #/paper/@place
// a sentence, a heading, a figure, a PDF page or the list of declarations.

export type Trace = "rests" | "uses";

export interface Route {
  paper?: string;
  record?: string;
  /** More parts than any address has. */
  extra?: string;
}

function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function readRoute(): Route {
  const [paper, record, ...rest] = window.location.hash.replace(/^#\/?/, "").split("/").map(decoded);
  return { paper: paper || undefined, record: record || undefined, extra: rest.length ? rest.join("/") : undefined };
}

export function routeHref(route: Route): string {
  if (!route.paper) return "./";
  const base = `./#/${encodeURIComponent(route.paper)}`;
  return route.record ? `${base}/${encodeURIComponent(route.record).replace(/^%40/, "@")}` : base;
}

// Addresses live after the # so the site works from any folder on a static
// host: #/paper and #/paper/declaration.

export type Trace = "rests" | "uses";

export interface Route {
  paper?: string;
  record?: string;
}

export function readRoute(): Route {
  const [paper, record] = window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return { paper: paper || undefined, record: record || undefined };
}

export function routeHref(route: Route): string {
  if (!route.paper) return "#/";
  const base = `#/${encodeURIComponent(route.paper)}`;
  return route.record ? `${base}/${encodeURIComponent(route.record)}` : base;
}

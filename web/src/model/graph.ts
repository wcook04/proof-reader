// The shared argument as the site draws it: one record per node from the
// captured graph, typed links grouped by their endpoints, the three paper
// selections and the regions the map uses to arrange the nodes.
//
// Every fact here comes from the API. The only editorial choices are the
// region titles below, which name the long record's three selected goals.

import type {
  EdgeRecord,
  EvidenceRecord,
  GraphMap,
  MapLink,
  NodeKind,
  NodeRecord,
  PaperRole,
  SourceRecord,
  Stage,
  SummaryCard,
  TheoremApplication,
} from "../api/types";

export type LinkKind = "supports" | "formalizes" | "assumes"
  | "lean_type_dependency" | "lean_value_dependency" | "lean_structural_dependency";

const LEAN_KINDS: readonly LinkKind[] = ["lean_type_dependency", "lean_value_dependency", "lean_structural_dependency"];

/** Where a record's statement comes from, by the source it names. */
export interface Origin {
  family: string; // stable key: a manuscript directory, "lean", "literature", "record" or "none"
  label: string; // "Full-support manuscript", "Lean formalisation", ...
  slot: 0 | 1 | 2 | 3; // colour slot; 0 is neutral
  place: string | null; // a short pointer within the source: "§2 Foundations", "variation", "MainConclusions"
  locator: string | null; // the record's own locator text
  url: string | null;
}

export interface ArgNode {
  id: string;
  ref: string;
  kind: NodeKind;
  label: string;
  status: string;
  /** Exact declaration identity from the node record, never inferred from its label. */
  declaration?: string;
  /** The node is a subject of a recorded extraction whose status is passed. */
  passedExtraction: boolean;
  region: string;
  origin: Origin;
  /** Per-paper membership: absent when the paper's support set omits the node. */
  papers: Partial<Record<Stage, { roles: string[]; direct: number }>>;
  /** The evidence (check) records the node's own record cites; absent when node records were not loaded. */
  evidenceIds?: string[];
}

export interface ArgEdge {
  key: string;
  from: string; // consumer
  to: string; // prerequisite (stored direction)
  kind: LinkKind;
  linkIds: string[]; // one per recorded relation, including scoped applications
  scoped: boolean; // at least one recorded relation carries a theorem application scope
  /** What the backend calls this relation, e.g. curated_argument_support. */
  semanticClass: string;
  /** The recorded warrant: how the prerequisite is used in this step. */
  warrant?: Warrant;
  /**
   * For an applied conditional theorem: the premises this use supplies.
   * Traversal discharges them for this use only (see argumentContexts).
   */
  application?: EdgeApplication;
}

/** An evidence record's account of one step, split into its parts. */
export interface Warrant {
  evidenceId: string;
  /** The mathematical content of the warrant, without the review boilerplate. */
  text: string;
  /** Where in the sources the step is made, as recorded. */
  sources: string | null;
  /** What kind of claim the step is, as recorded ("not a certified implication"). */
  scope: string | null;
  status: string; // the warrant's own review status, e.g. not_run
  tool: string;
  /** True when the same evidence record is cited by more than one stored relation. */
  shared: boolean;
  /** How many stored relations cite this evidence record (1 when it is this step's alone). */
  sharedWith: number;
  /** The evidence record's full details text, exactly as recorded. */
  details: string;
}

/** A recorded theorem application, kept whole on the edge that makes it. */
export interface EdgeApplication {
  rationale: string | null;
  bindings: { assumption: string; names: string[]; rationale: string; supplier: string }[];
  /** The theorem's premises this use still requires. */
  remaining: string[];
  /** Objects held fixed throughout the use: name → authored description. */
  shared: Record<string, string>;
  /** The binding's recorded status ("authored"); never a check result. */
  status: string | null;
  /** Where in the sources the application is made. */
  sourceSpan: { sourceId: string; startLine: number; endLine: number } | null;
  /** The application exactly as served. */
  record: Partial<TheoremApplication>;
}

/** Shape a served application for the site; drops nothing (the raw record is kept). */
export function edgeApplication(app: Partial<TheoremApplication>): EdgeApplication {
  const span = app.source_span;
  return {
    rationale: app.rationale ?? null,
    bindings: (app.premise_bindings ?? []).map((b) => ({
      assumption: b.assumption_id,
      names: b.binding_names ?? [],
      rationale: b.rationale ?? "",
      supplier: b.supplier_id,
    })),
    remaining: app.remaining_assumption_ids ?? [],
    shared: { ...(app.shared_bindings ?? {}) },
    status: app.status ?? null,
    sourceSpan: span ? { sourceId: span.source_id, startLine: span.start_line, endLine: span.end_line } : null,
    record: app,
  };
}

/** The premises an edge's application supplies (discharges) for its use; empty for a plain edge. */
export function suppliedPremises(edge: ArgEdge): string[] {
  return edge.application?.bindings.map((b) => b.assumption) ?? [];
}

/** A citation link between records: navigation only, not a dependency. */
export interface CiteLink {
  from: string;
  to: string;
  warrant?: Warrant;
}

export interface Region {
  id: string; // the goal that anchors the region
  title: string;
  goal: string;
  members: string[];
}

export interface OriginFamily {
  family: string;
  label: string;
  slot: 0 | 1 | 2 | 3;
  count: number;
}

export interface ArgGraph {
  origins: OriginFamily[];
  cites: CiteLink[];
  nodes: Map<string, ArgNode>;
  order: string[];
  edges: ArgEdge[];
  out: Map<string, ArgEdge[]>;
  in: Map<string, ArgEdge[]>;
  regions: Region[];
  regionOf: Map<string, string>;
  goals: string[];
  cyclic: Set<string>;
  boundaries: Map<string, string>;
}

/** Short names for the regions, keyed by goal id. Falls back to the goal label. */
const REGION_TITLES: Record<string, string> = {
  full_support: "Full support",
  scalar_value: "Value identities",
  qaoa_thermodynamic_first: "QAOA circuits",
};

const KIND_OF_LINK: Record<string, LinkKind> = {
  supports: "supports",
  formalizes: "formalizes",
  assumption_ids: "assumes",
  lean_type_dependency: "lean_type_dependency",
  lean_value_dependency: "lean_value_dependency",
  lean_structural_dependency: "lean_structural_dependency",
};

export function linkKind(link: MapLink): LinkKind | null {
  return KIND_OF_LINK[link.kind] ?? null;
}

function normalizeKind(kind: string): NodeKind {
  return kind === "goal" || kind === "assumption" || kind === "declaration" ? kind : "claim";
}

const NONE_ORIGIN: Origin = { family: "none", label: "No source recorded", slot: 0, place: null, locator: null, url: null };

export function buildGraph(
  map: GraphMap,
  summaries: SummaryCard[],
  regionGoals: string[],
  records: NodeRecord[] = [],
  sources: SourceRecord[] = [],
  stored: { edges: EdgeRecord[]; evidence: EvidenceRecord[] } = { edges: [], evidence: [] },
): ArgGraph {
  const roles = new Map<string, PaperRole[]>();
  for (const card of summaries) if (card.id) roles.set(card.id, card.papers ?? []);
  const recordsById = new Map(records.map((record) => [record.id, record]));
  // Compact cards retain these subjects; full evidence is authoritative when
  // loaded. Node evidence citations alone do not establish extraction scope.
  const evidenceById = new Map([...map.records.evidence, ...stored.evidence].map((record) => [record.id, record]));
  const extractedSubjects = new Set([...evidenceById.values()]
    .filter((record) => record.kind === "extraction" && record.status === "passed")
    .flatMap((record) => record.subject_ids ?? []));

  const nodes = new Map<string, ArgNode>();
  for (const card of map.records.nodes) {
    const record = recordsById.get(card.id);
    const papers: ArgNode["papers"] = {};
    for (const role of roles.get(card.id) ?? []) {
      papers[role.stage] = { roles: role.roles, direct: role.direct_passage_count };
    }
    nodes.set(card.id, {
      id: card.id,
      ref: card.ref,
      kind: normalizeKind(card.kind),
      label: card.label,
      status: card.status,
      declaration: record?.declaration ?? card.declaration,
      passedExtraction: extractedSubjects.has(card.id),
      region: "",
      origin: NONE_ORIGIN,
      papers,
    });
  }

  const grouped = new Map<string, ArgEdge>();
  for (const link of map.links) {
    const kind = linkKind(link);
    if (!kind || !nodes.has(link.from_node_id) || !nodes.has(link.to_node_id)) continue;
    const key = `${link.from_node_id}→${link.to_node_id}→${kind}`;
    const edge = grouped.get(key) ?? {
      key,
      from: link.from_node_id,
      to: link.to_node_id,
      kind,
      linkIds: [],
      scoped: false,
      semanticClass: link.semantic_class,
    };
    edge.linkIds.push(link.id);
    if (link.application_scope || link.id.includes("/scope/")) edge.scoped = true;
    if (link.application?.premise_bindings?.length && kind === "supports") edge.application = edgeApplication(link.application);
    grouped.set(key, edge);
  }
  const edges = [...grouped.values()];
  const out = new Map<string, ArgEdge[]>();
  const inc = new Map<string, ArgEdge[]>();
  for (const id of nodes.keys()) {
    out.set(id, []);
    inc.set(id, []);
  }
  for (const edge of edges) {
    out.get(edge.from)!.push(edge);
    inc.get(edge.to)!.push(edge);
  }

  const cyclic = new Set<string>();
  for (const component of map.components) {
    if (!component.cyclic) continue;
    for (const ref of component.members) {
      const id = ref.slice(ref.lastIndexOf("/nodes/") + "/nodes/".length);
      cyclic.add(id);
    }
  }

  const graph: ArgGraph = {
    origins: [],
    cites: [],
    nodes,
    order: [...nodes.keys()],
    edges,
    out,
    in: inc,
    regions: [],
    regionOf: new Map(),
    goals: [...nodes.values()].filter((n) => n.kind === "goal").map((n) => n.id),
    cyclic,
    boundaries: new Map(map.coverage.boundaries.map((b) => [b.node_id, b.text])),
  };
  const present = regionGoals.filter((goal) => nodes.has(goal));
  assignRegions(graph, present);
  assignOrigins(graph, records, sources, present[0]);
  attachWarrants(graph, stored.edges, stored.evidence);
  return graph;
}

// Origins: each record names the source its statement is taken from. Files in
// a manuscript's own directory belong to that manuscript; Lean files to the
// formalisation; literature sources to published papers; the project's own
// long record to itself. The three largest families take the three colour
// slots (validated colour-blind safe in both schemes); the rest stay neutral
// and are always named in words.
const MANUSCRIPT_NAMES: [RegExp, string][] = [
  [/^Full-support/i, "Full-support manuscript"],
  [/^QAOA/i, "QAOA manuscript"],
];

function titleCase(words: string): string {
  return words.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function placeIn(file: string): string {
  const stem = file.replace(/\.(tex|lean|md)$/, "");
  const numbered = stem.match(/^(\d+)-(.+)$/);
  if (numbered) return `§${Number(numbered[1])} ${titleCase(numbered[2])}`;
  return titleCase(stem);
}

function classify(record: NodeRecord | undefined, source: SourceRecord | undefined): Omit<Origin, "slot"> {
  const locator = record?.locator ?? null;
  if (!source) return { family: "none", label: "No source recorded", place: null, locator, url: null };
  const path = source.path ?? "";
  if (source.kind === "literature") {
    const id = source.url?.match(/arxiv\.org\/abs\/([\w.]+?)(v\d+)?$/)?.[1];
    return { family: "literature", label: "Published paper", place: id ? `arXiv:${id}` : source.revision ?? null, locator, url: source.url ?? null };
  }
  const file = path.split("/").pop() ?? path;
  if (/\.lean$/.test(path)) return { family: "lean", label: "Lean formalisation", place: placeIn(file), locator, url: source.url ?? null };
  const manuscript = path.match(/preprints\/([^/]+)\//)?.[1];
  if (manuscript) {
    const label = MANUSCRIPT_NAMES.find(([re]) => re.test(manuscript))?.[1] ?? titleCase(manuscript.split("-").slice(0, 3).join(" "));
    return { family: manuscript, label, place: placeIn(file), locator, url: source.url ?? null };
  }
  if (/papers\/|long/.test(path) || /reasoning-record/.test(locator ?? "") || /^Long record/.test(locator ?? "")) {
    return { family: "record", label: "The long record", place: null, locator, url: null };
  }
  return { family: "other", label: "Other source", place: file || null, locator, url: source.url ?? null };
}

function assignOrigins(graph: ArgGraph, records: NodeRecord[], sources: SourceRecord[], mainGoal?: string): void {
  if (!records.length) return;
  const byId = new Map(records.map((r) => [r.id, r]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const raw = new Map<string, Omit<Origin, "slot">>();
  const counts = new Map<string, { label: string; count: number }>();
  for (const id of graph.order) {
    const record = byId.get(id);
    if (record?.evidence_ids) graph.nodes.get(id)!.evidenceIds = [...record.evidence_ids];
    const origin = classify(record, record?.source_id ? sourceById.get(record.source_id) : undefined);
    raw.set(id, origin);
    const c = counts.get(origin.family) ?? { label: origin.label, count: 0 };
    c.count++;
    counts.set(origin.family, c);
  }
  // Manuscripts first: the one carrying most of the main result's argument
  // takes the first colour. Then the formalisation; the others stay neutral.
  const main = mainGoal ? closure(graph, mainGoal, "prerequisites") : new Set<string>();
  const inMain = new Map<string, number>();
  for (const id of main) {
    const family = raw.get(id)?.family;
    if (family) inMain.set(family, (inMain.get(family) ?? 0) + 1);
  }
  const coloured = [
    ...[...counts.entries()]
      .filter(([f]) => !["lean", "literature", "record", "none", "other"].includes(f))
      .sort((a, b) => (inMain.get(b[0]) ?? 0) - (inMain.get(a[0]) ?? 0) || b[1].count - a[1].count)
      .slice(0, 2),
    ...[...counts.entries()].filter(([f]) => f === "lean"),
  ];
  const slotOf = new Map<string, 1 | 2 | 3>();
  coloured.forEach(([family], i) => slotOf.set(family, (i + 1) as 1 | 2 | 3));
  for (const [id, origin] of raw) graph.nodes.get(id)!.origin = { ...origin, slot: slotOf.get(origin.family) ?? 0 };
  graph.origins = [...counts.entries()]
    .map(([family, { label, count }]) => ({ family, label, count, slot: (slotOf.get(family) ?? 0) as 0 | 1 | 2 | 3 }))
    .sort((a, b) => (a.slot || 9) - (b.slot || 9) || b.count - a.count);
}

// Warrants: each stored edge names evidence records, and the review record
// whose subjects are the edge's two endpoints says how the step is made.
// Whether a warrant is shared is decided by identity: how many stored
// relations cite the same evidence record, not how many subjects it names.

const REVIEW_PREAMBLE = /^Authored source comparison completed for this candidate; independent semantic acceptance remains not_run\.\s*/;

/** Split a warrant's recorded text into its statement, sources and scope. */
export function warrantParts(details: string): { text: string; sources: string | null; scope: string | null } {
  let rest = details.replace(REVIEW_PREAMBLE, "").trim();
  let scope: string | null = null;
  const scopeAt = rest.search(/\bScope:\s/);
  if (scopeAt >= 0) {
    scope = rest.slice(scopeAt).replace(/^Scope:\s*/, "").trim() || null;
    rest = rest.slice(0, scopeAt).trim();
  }
  let sources: string | null = null;
  const sourcesAt = rest.search(/\bSources?:\s/);
  if (sourcesAt > 0) {
    sources = rest.slice(sourcesAt).replace(/^Sources?:\s*/, "").trim() || null;
    rest = rest.slice(0, sourcesAt).trim();
  }
  return { text: rest, sources, scope };
}

function warrantFor(
  evidenceIds: string[],
  from: string,
  to: string,
  evidence: Map<string, EvidenceRecord>,
  citedBy: Map<string, number>,
): Warrant | undefined {
  const reviews = evidenceIds.map((id) => evidence.get(id)).filter((e): e is EvidenceRecord => !!e && e.kind === "semantic_review");
  const own = reviews
    .filter((e) => e.subject_ids.includes(from) && e.subject_ids.includes(to))
    .sort((a, b) => a.subject_ids.length - b.subject_ids.length)[0];
  const chosen = own ?? reviews[0];
  if (!chosen) return undefined;
  const sharedWith = citedBy.get(chosen.id) ?? 1;
  return {
    evidenceId: chosen.id,
    ...warrantParts(chosen.details),
    status: chosen.status,
    tool: chosen.tool,
    shared: sharedWith > 1,
    sharedWith,
    details: chosen.details,
  };
}

/** How many stored relations cite each evidence record (each relation counted once). */
export function evidenceCitations(edges: readonly EdgeRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of edges) for (const id of new Set(record.evidence_ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function attachWarrants(graph: ArgGraph, edges: EdgeRecord[], evidence: EvidenceRecord[]): void {
  if (!edges.length) return;
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const citedBy = evidenceCitations(edges);
  const stored = new Map<string, EdgeRecord>();
  for (const record of edges) {
    if (record.kind === "cites") {
      graph.cites.push({ from: record.from, to: record.to, warrant: warrantFor(record.evidence_ids, record.from, record.to, byId, citedBy) });
      continue;
    }
    stored.set(`${record.from}→${record.to}→${record.kind}`, record);
  }
  for (const edge of graph.edges) {
    const record = stored.get(`${edge.from}→${edge.to}→${edge.kind}`);
    if (!record) continue;
    edge.warrant = warrantFor(record.evidence_ids, edge.from, edge.to, byId, citedBy);
    // The stored record and the map link carry the same application; the
    // stored one is authoritative when both are present.
    const app = record.application;
    if (app?.premise_bindings?.length && edge.kind === "supports") edge.application = edgeApplication(app);
  }
}

// ------------------------------------------------- scoped argument traversal
// Mirrors the backend's `argument_contexts` (contracts.py). A recorded
// application of a conditional theorem supplies some of its premises for that
// use only. Traversal therefore walks states (node, discharged premises):
// following an edge adds the premises its application supplies; a node's own
// assumptions are followed with the current discharged set. Retained Lean
// axiom dependencies and proof holes restore their own ID on that path: an
// authored binding cannot change a Lean proof term. Keeping states, rather
// than deleting premises globally, also preserves an independent free use.

const ALL_KINDS: readonly LinkKind[] = ["supports", "formalizes", "assumes", ...LEAN_KINDS];

/** One reachable context: a node and the premises discharged on the way to it. */
export interface ArgumentContext {
  key: string;
  node: string;
  /** Sorted premise ids discharged in this context. */
  discharged: string[];
}

/** One followed relation between two contexts (keys of `ArgumentContexts.states`). */
export interface ContextTransition {
  from: string;
  to: string;
  edge: ArgEdge;
}

/** The reachable contexts from a set of roots, and the relations followed between them. */
export interface ArgumentContexts {
  states: Map<string, ArgumentContext>;
  transitions: ContextTransition[];
}

export interface ContextOptions {
  /** Relation kinds to follow; "assumes" follows nodes' own assumptions. Default: all argument relations. */
  kinds?: readonly LinkKind[];
}

const contextKey = (node: string, discharged: readonly string[]) => `${node}\u0000${discharged.join("\u0000")}`;

/**
 * Every (node, discharged premises) context reachable from `roots` along
 * prerequisites, with the transitions between them, using the backend's
 * `argument_contexts` rule within the relation scope supplied by the API.
 */
export function argumentContexts(graph: ArgGraph, roots: string | readonly string[], options: ContextOptions = {}): ArgumentContexts {
  const kinds = options.kinds ?? ALL_KINDS;
  const states = new Map<string, ArgumentContext>();
  const transitions: ContextTransition[] = [];
  const pending: ArgumentContext[] = (typeof roots === "string" ? [roots] : [...roots])
    .filter((id) => graph.nodes.has(id))
    .map((node) => ({ key: contextKey(node, []), node, discharged: [] }));
  while (pending.length) {
    const state = pending.pop()!;
    if (states.has(state.key) || state.discharged.includes(state.node)) continue;
    states.set(state.key, state);
    for (const edge of graph.out.get(state.node) ?? []) {
      if (!kinds.includes(edge.kind)) continue;
      const supplied = suppliedPremises(edge);
      let scope = supplied.length ? [...new Set([...state.discharged, ...supplied])].sort() : state.discharged;
      if (scope.includes(edge.to)) {
        const target = graph.nodes.get(edge.to)!;
        const isHole = target.id === "sorryAx" || target.declaration === "sorryAx";
        const isLeanDependency = target.kind === "assumption" && (
          (edge.kind === "assumes" && graph.nodes.get(state.node)!.passedExtraction)
          || LEAN_KINDS.includes(edge.kind)
        );
        if (!isHole && !isLeanDependency) continue;
        scope = scope.filter((id) => id !== edge.to);
      }
      const next = { key: contextKey(edge.to, scope), node: edge.to, discharged: scope };
      transitions.push({ from: state.key, to: next.key, edge });
      pending.push(next);
    }
  }
  return { states, transitions };
}

/**
 * What the argument for `roots` consists of once application scopes are
 * respected: the reachable records, and the keys of the edges that are live
 * (followed) in at least one reachable context. The map draws exactly these.
 */
export function argumentProjection(graph: ArgGraph, roots: string | readonly string[], options: ContextOptions = {}): { nodes: Set<string>; edges: Set<string> } {
  const { states, transitions } = argumentContexts(graph, roots, options);
  return {
    nodes: new Set([...states.values()].map((s) => s.node)),
    edges: new Set(transitions.map((t) => t.edge.key)),
  };
}

/** Everything reachable from `start` along stored or reversed links, ignoring application scopes. */
function plainClosure(graph: ArgGraph, start: readonly string[], direction: "prerequisites" | "consumers", kinds: readonly LinkKind[]): Set<string> {
  const seen = new Set<string>(start.filter((id) => graph.nodes.has(id)));
  const queue = [...seen];
  const adjacency = direction === "prerequisites" ? graph.out : graph.in;
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of adjacency.get(id) ?? []) {
      if (!kinds.includes(edge.kind)) continue;
      const next = direction === "prerequisites" ? edge.to : edge.from;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * The records an argument rests on (`prerequisites`), or the records whose
 * argument contains `start` (`consumers`). Both respect application scopes:
 * a premise supplied by a recorded application is not part of the consumer's
 * argument unless it is also reached by an independent free use or retained
 * as a formal obligation. The prerequisites match the backend's `closure`
 * for the same root and recorded relation scope.
 */
export function closure(
  graph: ArgGraph,
  start: string | readonly string[],
  direction: "prerequisites" | "consumers",
  kinds: readonly LinkKind[] = ALL_KINDS,
): Set<string> {
  const starts = typeof start === "string" ? [start] : [...start];
  if (direction === "prerequisites") return argumentProjection(graph, starts, { kinds }).nodes;
  // A consumer must be an unscoped ancestor; keep those whose scoped argument
  // actually contains a start record.
  const candidates = plainClosure(graph, starts, "consumers", kinds);
  if (!graph.edges.some((e) => e.application)) return candidates;
  const out = new Set<string>();
  for (const id of candidates) {
    if (starts.includes(id)) {
      out.add(id);
      continue;
    }
    const reached = argumentProjection(graph, id, { kinds }).nodes;
    if (starts.some((s) => reached.has(s))) out.add(id);
  }
  return out;
}

/** Edges whose endpoints both lie in `members`. */
export function inducedEdges(graph: ArgGraph, members: Set<string>): ArgEdge[] {
  return graph.edges.filter((edge) => members.has(edge.from) && members.has(edge.to));
}

// Regions follow the record identifiers' own namespaces (for this corpus
// `support.`, `scalar.` and `circuit.`), which the authors use for the three
// parts of the argument. Each region is named after the selected goal whose
// recorded prerequisites lie mostly inside it. Goals, formal statements and
// assumptions outside those namespaces join the region of their neighbours.
// Regions are ordered so that recorded uses mostly point to the left: the
// most foundational part comes first.
function namespaceOf(id: string): string {
  return id.includes(".") ? id.slice(0, id.indexOf(".")) : "";
}

function assignRegions(graph: ArgGraph, goals: string[]): void {
  const sizes = new Map<string, number>();
  for (const id of graph.order) {
    const space = namespaceOf(id);
    if (space) sizes.set(space, (sizes.get(space) ?? 0) + 1);
  }
  const major = new Set([...sizes].filter(([, n]) => n >= 8).map(([space]) => space));
  const regionOf = graph.regionOf;
  for (const id of graph.order) {
    const space = namespaceOf(id);
    if (major.has(space)) regionOf.set(id, space);
  }
  if (major.size === 0) {
    // No usable namespaces: one region per selected goal, by its prerequisites.
    for (const goal of goals) {
      for (const id of closure(graph, goal, "prerequisites")) if (!regionOf.has(id)) regionOf.set(id, goal);
      major.add(goal);
    }
  }
  // Everything else joins the region most of its neighbours belong to.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const id of graph.order) {
      if (regionOf.has(id)) continue;
      const votes = new Map<string, number>();
      const node = graph.nodes.get(id)!;
      const neighbours =
        node.kind === "goal"
          ? (graph.out.get(id) ?? []).map((e) => e.to)
          : [...(graph.in.get(id) ?? []).map((e) => e.from), ...(graph.out.get(id) ?? []).map((e) => e.to)];
      for (const n of neighbours) {
        const r = regionOf.get(n);
        if (r) votes.set(r, (votes.get(r) ?? 0) + 1);
      }
      const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      if (best) {
        regionOf.set(id, best[0]);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const fallback = [...major][0] ?? "";
  for (const id of graph.order) if (!regionOf.has(id)) regionOf.set(id, fallback);

  // Order regions so that cross-region uses point leftwards where possible.
  const ids = [...major];
  const flow = (a: string, b: string) =>
    graph.edges.filter((e) => regionOf.get(e.from) === a && regionOf.get(e.to) === b).length;
  const score = new Map(ids.map((r) => [r, ids.reduce((s, other) => s + flow(r, other) - flow(other, r), 0)]));
  ids.sort((a, b) => score.get(a)! - score.get(b)! || (a < b ? -1 : 1));

  graph.regions = ids.map((region) => {
    const members = graph.order.filter((id) => regionOf.get(id) === region);
    // The region's goal: a selected goal inside it, else any goal inside it.
    const goal =
      goals.find((g) => regionOf.get(g) === region) ??
      members.find((id) => graph.nodes.get(id)!.kind === "goal") ??
      members[0];
    return {
      id: region,
      goal,
      title: REGION_TITLES[goal] ?? graph.nodes.get(goal)?.label ?? region,
      members,
    };
  });
  for (const [id, region] of regionOf) graph.nodes.get(id)!.region = region;
}

/** The node's role in one paper's selection, for the reading lens. */
export function lensRole(node: ArgNode, stage: Stage | null): "direct" | "support" | "outside" | "all" {
  if (!stage) return "all";
  const membership = node.papers[stage];
  if (!membership) return "outside";
  if (membership.roles.some((r) => r.startsWith("mapped_"))) return "direct";
  return "support";
}

// Types for the parts of the lean-exposition web API (version 1.2) that the
// site reads. Field names follow the API exactly; unknown fields are ignored.

export type Stage = "long" | "short" | "expository";
export const STAGES: readonly Stage[] = ["expository", "short", "long"];

export interface Snapshot {
  bundle_id: string;
  bundle_version: string;
  cache_key: string;
  graph_sha256: string;
  manifest_sha256: string;
  ref: string;
}

export interface Envelope<T> {
  api_version: string;
  snapshot: Snapshot;
  data: T;
}

export interface ApiErrorBody {
  api_version?: string;
  error: { code: string; message: string };
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  next: string | null;
}

export interface Span {
  start_byte: number;
  end_byte: number;
  start_line: number;
  end_line: number;
}

export interface Discovery {
  companion_resolution: {
    configured: boolean;
    config_sha256: string;
    document_paths: Partial<Record<Stage, string>>;
    fragment_verification: string;
    resolver_version: string;
  };
  documents: { name: string; href: string; sha256: string }[];
  limits: Record<string, number>;
  semantic_certification: boolean;
}

export interface PaperSummary {
  stage: Stage;
  state: string;
  review_state: string;
  passages: number;
  sections: number;
  href: string;
  document_href: string;
  structure_href: string;
  reading_href: string;
  markdown_ref: string;
  mapping_ref: string;
  paper_scope: {
    selected_goal_ids: string[];
    selected_goal_refs: string[];
    meaning: string;
  };
  coverage: { mapped_content_bytes: number; unmapped_bytes: number; scope: string };
}

export interface Overview {
  graph: { id: string; notes: string[] };
  node_status_counts: Record<string, number>;
  record_counts: Record<string, number>;
  relation_counts: Record<string, number>;
  papers: PaperSummary[];
  reading_order_is_dependency_order: boolean;
  coverage: { scope: string };
}

export type NodeKind = "claim" | "goal" | "assumption" | "declaration";

export interface MapNodeCard {
  id: string;
  kind: NodeKind | string;
  label: string;
  ref: string;
  status: string;
  /** Exact Lean declaration identity when recorded; needed to retain proof holes. */
  declaration?: string;
}

/** One premise of a conditional theorem that a recorded application supplies. */
export interface PremiseBinding {
  /** The theorem's assumption record that this use discharges. */
  assumption_id: string;
  /** Names of the shared objects the supplied premise speaks about. */
  binding_names: string[];
  rationale: string;
  /** The record that supplies the premise for this use. */
  supplier_id: string;
}

/** Lines of a source file, inclusive, where an application is made. */
export interface ApplicationSourceSpan {
  source_id: string;
  start_line: number;
  end_line: number;
}

/**
 * An authored application of a conditional theorem, stored on a `supports`
 * edge (graph 1.2). The edge still points from the conclusion to the theorem;
 * only the bound premises are discharged for this use.
 */
export interface TheoremApplication {
  premise_bindings: PremiseBinding[];
  rationale: string;
  /** The theorem's premises this use still requires, as validated by the backend. */
  remaining_assumption_ids: string[];
  /** Objects held fixed throughout the use: name to authored description. */
  shared_bindings: Record<string, string>;
  source_span: ApplicationSourceSpan;
  /** Always "authored": reference checks never establish the binding's meaning. */
  status: string;
}

/** The premises already discharged at each end of one scoped map link. */
export interface ApplicationScope {
  from_discharged: string[];
  to_discharged: string[];
}

/**
 * A relation as the `/graph` map serves it. A stored edge appears once plainly
 * and once more (`…/scope/<digest>`) for each distinct application context it
 * is reached in; a node's assumption reference appears with `owner_ref` and
 * `source_field` instead of `record_ref`.
 */
export interface MapLink {
  id: string;
  /** The stored edge; absent for assumption references, which name their owner. */
  record_ref?: string;
  kind: string; // supports | formalizes | assumption_ids
  semantic_class: string;
  from: string;
  to: string;
  from_node_id: string;
  to_node_id: string;
  derived: boolean;
  /** For an assumption reference: the node record that lists it. */
  owner_ref?: string;
  /** For an assumption reference: the node field it comes from ("assumption_ids"). */
  source_field?: string;
  /** Present on the edge that records a theorem application. */
  application?: TheoremApplication;
  /** Present on a link reached inside an application's scope. */
  application_scope?: ApplicationScope;
}

export interface GraphMap {
  view: string;
  representation: string;
  graph_id: string;
  graph_sha256: string;
  selected_goals: string[];
  records: {
    nodes: MapNodeCard[];
    edges: { kind: string; label: string; ref: string }[];
    citations: { id: string; label: string; ref: string }[];
    evidence: {
      id: string;
      kind: string;
      label: string;
      ref: string;
      status: string;
      relevant: boolean;
      /** Extraction cards retain their subjects so compact traversal keeps formal obligations. */
      subject_ids?: string[];
    }[];
    sources: { id: string; kind: string; label: string; ref: string }[];
  };
  links: MapLink[];
  components: { id: string; cyclic: boolean; members: string[] }[];
  coverage: {
    boundaries: { node_id: string; text: string }[];
    claim: string;
    empty_result_meaning: string;
    query_truncated: boolean;
  };
  records_href: string;
}

export interface PaperRole {
  stage: Stage;
  roles: string[]; // mapped_claim | mapped_assumption | recorded_prerequisite
  direct_passage_count: number;
}

export interface SummaryCard {
  ref: string;
  table: string;
  id?: string;
  kind?: string;
  label: string;
  status?: string;
  href: string;
  papers: PaperRole[];
}

export interface Treatment {
  claim_id: string;
  kinds: string[];
  rationale: string;
}

export interface StructurePassage {
  anchor: string;
  ref: string;
  section_ref: string;
  block_span: Span;
  content_span: Span;
  claim_ids: string[];
  assumption_ids: string[];
  citation_ids: string[];
  evidence_class: string;
  selected: boolean;
  treatments?: Treatment[];
  rationale?: string;
}

export interface Section {
  ref: string;
  parent_ref: string | null;
  level: number;
  title: string;
  span: Span;
  heading_span: Span;
}

export interface DocumentPart {
  kind: "mapped_passage" | "unmapped_text" | string;
  ref: string;
  span: Span;
  passage_ref?: string;
  segment_ref?: string;
}

export interface MappingReadingLink {
  from_anchor: string;
  to_stage: Stage;
  to_anchor: string;
  kind: "expands" | "illustrates" | "answers" | string;
  rationale: string;
  from_text_sha256: string;
  to_text_sha256: string;
}

export interface PaperStructure {
  stage: Stage;
  state: string;
  review_state: string;
  paper: {
    path: string;
    byte_length: number;
    line_count: number;
    sections: Section[];
    passages: StructurePassage[];
    document_parts: DocumentPart[];
    reading_order: unknown[];
  };
  reading_links: MappingReadingLink[];
  paper_scope: { selected_goal_ids: string[] };
  resources: Record<string, string>;
  coverage: Record<string, unknown>;
}

export interface Passage {
  anchor: string;
  ref: string;
  section_ref: string;
  block_span: Span;
  content_span: Span;
  claim_ids: string[];
  assumption_ids: string[];
  citation_ids: string[];
  evidence_class: string;
  rationale: string;
  text: string;
}

export interface AlignedPassage {
  stage: Stage;
  anchor: string;
  mapping_field: string;
  passage_ref: string;
  span: Span;
  text: string;
  query_href: string;
  reading_href: string;
  paper_href: string;
}

export interface RecordRelation {
  family: string;
  kind: string;
  from: string;
  to: string;
  id: string;
  derived: boolean;
  semantic_class?: string;
}

export interface RecordDetail {
  ref: string;
  table: string;
  record: Record<string, unknown> & {
    id: string;
    kind?: string;
    label?: string;
    status?: string;
    statement?: string;
    boundary?: string;
    declaration?: string;
    locator?: string;
    source_id?: string;
    citation_ids?: string[];
    evidence_ids?: string[];
    assumption_ids?: string[];
  };
  relations: RecordRelation[];
  aligned_passages?: AlignedPassage[];
  usage: {
    direct_passages: { stage: Stage; anchor: string; mapping_field: string }[];
    paper_memberships: { stage: Stage; roles: string[] }[];
    paper_focus: unknown[];
  };
  lenses?: Record<string, string>;
  neighborhood_href?: string;
}

export interface PassageCard {
  stage: Stage;
  anchor: string;
  ref: string;
  section_ref: string;
  content_span: Span;
  claim_refs: string[];
  evidence_class: string;
  treatments: Treatment[];
  query_href: string;
  reading_href: string;
}

export interface ReadingItem {
  kind: "expands" | "illustrates" | "answers" | "shared_claim" | string;
  derived: boolean;
  annotation_basis: string;
  from: string;
  to: string;
  selection_relation: "incoming" | "outgoing" | "internal";
  rationale?: string;
  shared_claim_refs?: string[];
}

export interface ReadingResponse extends Page<ReadingItem> {
  passage_cards: PassageCard[];
  source_passage_refs: string[];
  coverage: { query_truncated: boolean };
}

export interface SearchItem {
  ref: string;
  table: string;
  label?: string;
  excerpt?: string;
  excerpt_start_character?: number;
  excerpt_truncated_start?: boolean;
  excerpt_truncated_end?: boolean;
  matches?: { start_character: number; end_character: number; token: string }[];
  href?: string;
  query_href?: string;
  stage?: Stage;
  anchor?: string;
  [key: string]: unknown;
}

export interface ResolvedLink {
  href: string;
  status: string;
  reason: string;
  fragment: string | null;
  target?: { stage: Stage; paper_href: string; document_href: string; structure_href: string };
}

export interface NodeRecord {
  id: string;
  kind: string;
  label: string;
  status: string;
  statement?: string;
  boundary?: string;
  locator?: string;
  source_id?: string;
  declaration?: string;
  citation_ids?: string[];
  evidence_ids?: string[];
  assumption_ids?: string[];
}

export interface SourceRecord {
  id: string;
  kind: string; // file | literature
  path?: string;
  url?: string;
  revision?: string;
  license?: string;
}

export interface FullRecordItem<T> {
  ref: string;
  table: string;
  record: T;
}

/** A stored edge. `from` is the result that uses `to`. */
export interface EdgeRecord {
  from: string;
  to: string;
  kind: string; // supports | formalizes | cites
  evidence_ids: string[];
  /** An applied conditional theorem: which of its premises this use supplies. */
  application?: Partial<TheoremApplication>;
}

export interface EvidenceRecord {
  id: string;
  kind: string; // semantic_review | source_hash | lean_build | extraction | comparator
  status: string;
  tool: string;
  details: string;
  subject_ids: string[];
  source_ids: string[];
  command: string[];
  receipt_path?: string;
  receipt_sha256?: string;
}

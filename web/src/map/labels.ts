// Plain-language names for node kinds and relations, shared by the map and the panels.

/** Plain-language name of a node kind, as the map's cards and key say it. */
export function kindName(kind: string): string {
  switch (kind) {
    case "goal":
      return "Main result";
    case "declaration":
      return "Lean declaration";
    case "assumption":
      return "Assumption";
    default:
      return "Claim";
  }
}

/** A relation's name in the interface (DESIGN.md, Relations). */
export function relationName(kind: string): string {
  switch (kind) {
    case "assumes":
      return "Explicit assumption";
    case "formalizes":
      return "Recorded Lean correspondence";
    case "cites":
      return "Citation";
    case "lean_type_dependency":
      return "Lean type dependency";
    case "lean_value_dependency":
      return "Lean proof or value dependency";
    case "lean_structural_dependency":
      return "Lean structural dependency";
    default:
      return "Recorded support";
  }
}

/** The relation between two named records, in words that say only what was recorded. */
export function relationPhrase(kind: string, from: string, to: string): string {
  if (kind === "assumes") return `${from} assumes ${to}`;
  if (kind === "formalizes") return `${from} has a recorded Lean correspondence with ${to}`;
  if (kind === "lean_type_dependency") return `${from} refers to ${to} in its elaborated Lean type`;
  if (kind === "lean_value_dependency") return `${from} refers to ${to} in its elaborated Lean proof or value`;
  if (kind === "lean_structural_dependency") return `${from} has a Lean structural reference to ${to}`;
  return `${from} uses ${to}`;
}

// The right page has two modes, as Lean Exposition's has, with the same words. Clicking
// the mode you are in does nothing, so the toggle can never trap anyone.

export type PaneMode = "graph" | "lean";

export function ModeToggle({ mode, onMode }: { mode: PaneMode; onMode(mode: PaneMode): void }) {
  return (
    <div className="mode-toggle" role="group" aria-label="What the right pane shows">
      <button type="button" aria-pressed={mode === "graph"} onClick={() => onMode("graph")}>Graph</button>
      <button type="button" aria-pressed={mode === "lean"} onClick={() => onMode("lean")}>Lean</button>
    </div>
  );
}

// A way to the one passage that says how the page was made, at the head of the index
// (#/paper/@declarations). Kept apart from the Lean page so the paper's first screen can
// carry it. A button: the reading copy reads its own links as places in the paper.

import type { ReactNode } from "react";

export function MadeLink({ onOpen, children = "How this page was made" }: { onOpen(): void; children?: ReactNode }) {
  return <button type="button" className="made__link" onClick={onOpen}>{children}</button>;
}

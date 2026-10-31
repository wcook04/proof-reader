# Third-party notices

The argument map's engine (`src/map/engine/`) adapts code from the projects
below. Each adapted file names its source and what was changed in a header
comment. All five projects are distributed under the MIT licence, whose text
follows the list.

| Project | Copyright | Adapted in |
| --- | --- | --- |
| [dagre](https://github.com/dagrejs/dagre) | Copyright (c) 2012-2014 Chris Pettitt | `order.ts`: bilayer crossing counter (`lib/order/cross-count.ts`), barycenter ordering and unsortable-node handling (`lib/order/barycenter.ts`, `lib/order/sort.ts`) |
| [d3-dag](https://github.com/erikbrinkman/d3-dag) | Copyright (c) 2018 Erik Brinkman | `order.ts`: adjacent transposition (`src/sugiyama/twolayer/greedy.ts`); `coords.ts`: quadratic objective terms (`src/sugiyama/coord/utils.ts`, `src/sugiyama/coord/quad.ts`); `layout.ts`: longest-path layering and dummy chains (`src/sugiyama/layering/longest-path.ts`, `src/sugiyama/sugify.ts`) |
| [xyflow](https://github.com/xyflow/xyflow) | Copyright (c) 2019-2025 webkid GmbH | `router.ts`: rounded orthogonal corners (`packages/system/src/utils/edges/smoothstep-edge.ts`); `camera.ts`: fitting a box into the view (`packages/system/src/utils/general.ts`) |
| [markmap](https://github.com/markmap/markmap) | Copyright (c) 2020 Gerald | `camera.ts`: minimal pan to keep a node visible (`packages/markmap-view/src/view.ts`); the enter-from-opener and exit-into-parent choreography in `ArgumentTree.tsx` follows the same file |
| [msagljs](https://github.com/microsoft/msagljs) | Copyright (c) Microsoft Corporation | `router.ts`: arrowhead triangle (`modules/renderer-svg/src/svgCreator.ts`); the order-then-assign split for tracks follows `modules/core/src/routing/nudging/` without copying code |

Two further conventions are followed without copying any code. In `router.ts`,
the lanes in each gap between rows are ordered by comparing, for each pair of
lines, how many crossings each order would cause, as the orthogonal edge router
of the [Eclipse Layout Kernel](https://github.com/eclipse/elk)'s layered
algorithm does. In `engine/occurrences.ts`, a shared record with no inputs of
its own is drawn beside each result that uses it, as the clone marker of the
[Systems Biology Graphical Notation](https://sbgn.github.io/) does for shared
molecules.

## MIT licence

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

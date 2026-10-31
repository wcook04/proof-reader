// The authors' PDF, drawn by pdf.js. Passages are boxes computed from the PDF's
// own words at build time, so the page never retypes the paper. The highlight
// lies under the ink, as a highlighter does, and a bar in the margin marks each
// sentence tied to the Lean. Blank margins are trimmed on screen, so the type
// is as large as the page allows. Scrolling reports the passage at the reading
// line.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Mention, Passage } from "../app/edition";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const READING_LINE = 0.34;
/** The space above each page; app.css sets the same 20px. */
const PAGE_GAP = 20;

export interface PdfHandle {
  scrollToPassage(id: string, instant?: boolean): void;
}

interface Props {
  url: string;
  /** Each page's width and height, in PDF points. */
  sizes: [number, number][];
  /** The box on every page that holds something printed. */
  crop: [number, number, number, number];
  passages: Passage[];
  /** Every printed occurrence of a Lean name. */
  mentions: Mention[];
  active: string | null;
  lit: ReadonlySet<string>;
  /** Where the reader opens. */
  start: string | null;
  onActive(id: string | null): void;
  onPick(id: string): void;
  onName(name: string): void;
  onUserScroll(): void;
}

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane(props, ref) {
  const { url, sizes, crop, passages, mentions, active, lit, start, onActive, onPick, onName, onUserScroll } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const programmatic = useRef(0);
  const arrive = useRef(0);

  const [left, top, right, bottom] = crop;
  const scale = width / (right - left);
  const pageHeight = (bottom - top) * scale;

  useEffect(() => {
    let live = true;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((data) => {
        if (!live) return;
        task = pdfjs.getDocument({ data });
        return task.promise.then((doc) => {
          if (live) setPdf(doc);
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [url]);

  // Measured before the first paint, so the pages never jump into place.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth - PAGE_GAP);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const byPage = useMemo(() => {
    const map = new Map<number, Passage[]>();
    for (const p of passages) map.set(p.page, [...(map.get(p.page) ?? []), p]);
    return map;
  }, [passages]);

  const namesByPage = useMemo(() => {
    const map = new Map<number, Mention[]>();
    for (const m of mentions) map.set(m.page, [...(map.get(m.page) ?? []), m]);
    return map;
  }, [mentions]);

  const passageTop = useCallback(
    // From the page sizes, not the DOM, so it holds while the layout settles.
    (p: Passage) => PAGE_GAP + (p.page - 1) * (pageHeight + PAGE_GAP) + (p.rects[0][1] - top) * scale,
    [pageHeight, scale, top],
  );

  const go = useCallback(
    (id: string, instant = false) => {
      const passage = passages.find((p) => p.id === id);
      const el = scroller.current;
      if (!passage || !el) return;
      programmatic.current = Date.now() + 900;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const target = passageTop(passage) - el.clientHeight * READING_LINE;
      el.scrollTo({ top: target, behavior: reduced || instant ? "auto" : "smooth" });
      // A background tab may never run the animation, so arrive regardless.
      window.clearTimeout(arrive.current);
      arrive.current = window.setTimeout(() => {
        if (Math.abs(el.scrollTop - target) > 40) el.scrollTo({ top: target, behavior: "auto" });
      }, 950);
    },
    [passages, passageTop],
  );

  useImperativeHandle(ref, () => ({ scrollToPassage: go }), [go]);

  // A new width rescales every page, so keep the reader on their sentence.
  const place = useRef(start);
  place.current = active ?? place.current ?? start;
  useEffect(() => {
    if (width && place.current) go(place.current, true);
  }, [go, width]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !width) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      if (Date.now() < programmatic.current) return;
      const line = el.scrollTop + el.clientHeight * READING_LINE;
      let best: Passage | null = null;
      let bestGap = el.clientHeight * 0.5;
      for (const p of passages) {
        const gap = Math.abs(passageTop(p) - line);
        if (gap < bestGap) {
          best = p;
          bestGap = gap;
        }
      }
      onActive(best?.id ?? null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [passages, passageTop, width, onActive]);

  /** A pointer position in PDF points. */
  const point = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / scale + left, y: (event.clientY - box.top) / scale + top };
  };

  const nameAt = (event: React.MouseEvent<HTMLDivElement>, page: number): Mention | null => {
    const { x, y } = point(event);
    return (namesByPage.get(page) ?? []).find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ?? null;
  };

  const hit = (event: React.MouseEvent<HTMLDivElement>, page: number): string | null => {
    const { x, y } = point(event);
    for (const p of byPage.get(page) ?? []) {
      if (p.rects.some(([x0, y0, x1, y1]) => x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 1 && y <= y1 + 1)) return p.id;
    }
    return null;
  };

  return (
    <div
      className="pdf"
      ref={scroller}
      tabIndex={0}
      aria-label="The paper"
      onWheel={onUserScroll}
      onTouchMove={onUserScroll}
      onKeyDown={(e) => {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) onUserScroll();
      }}
    >
      {failed && <p className="pdf__failed">The PDF could not be loaded. Use the link to the published paper above.</p>}
      {width > 0 && sizes.map(([w, h], index) => {
        const page = index + 1;
        return (
          <div
            key={page}
            className={`pdf__page${hover || hoverName ? " has-hover" : ""}`}
            data-page={page}
            style={{ width, height: pageHeight }}
            onMouseMove={(e) => {
              const name = nameAt(e, page);
              setHoverName(name ? `${page}:${name.rect[0]}:${name.rect[1]}` : null);
              setHover(name ? null : hit(e, page));
            }}
            onMouseLeave={() => {
              setHover(null);
              setHoverName(null);
            }}
            onClick={(e) => {
              if (window.getSelection()?.toString()) return;
              const name = nameAt(e, page);
              if (name) return onName(name.name);
              const id = hit(e, page);
              if (id) onPick(id);
            }}
          >
            <div className="pdf__whole" style={{ left: -left * scale, top: -top * scale, width: w * scale, height: h * scale }}>
              {(namesByPage.get(page) ?? []).map((m) => {
                const key = `${page}:${m.rect[0]}:${m.rect[1]}`;
                const [x0, y0, x1, y1] = m.rect;
                return <span key={key} className={`mention${hoverName === key ? " is-hover" : ""}`} style={{ left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale }} />;
              })}
              {(byPage.get(page) ?? []).flatMap((p) => {
                const state = `${p.id === active ? " is-active" : ""}${p.id === hover ? " is-hover" : ""}${lit.has(p.id) ? " is-lit" : ""}`;
                const first = p.rects[0][1];
                const last = p.rects[p.rects.length - 1][3];
                return [
                  <span key={`${p.id}-tie`} data-passage={p.id} className={`tie${state}`} style={{ left: (right - 6) * scale, top: first * scale, height: (last - first) * scale }} />,
                  ...p.rects.map(([x0, y0, x1, y1], i) => (
                    <span
                      key={`${p.id}${i}`}
                      data-passage={p.id}
                      className={`mark${state}`}
                      style={{ left: (x0 - 1.5) * scale, top: (y0 - 0.5) * scale, width: (x1 - x0 + 3) * scale, height: (y1 - y0 + 1) * scale }}
                    />
                  )),
                ];
              })}
              {pdf && <PageCanvas pdf={pdf} page={page} width={w * scale} root={scroller} />}
            </div>
          </div>
        );
      })}
    </div>
  );
});

function PageCanvas({ pdf, page, width, root }: { pdf: PDFDocumentProxy; page: number; width: number; root: React.RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { root: root.current, rootMargin: "1200px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    void (async () => {
      const proxy = await pdf.getPage(page);
      if (cancelled || !canvas.current || !text.current) return;
      const unit = proxy.getViewport({ scale: 1 });
      const cssScale = width / unit.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Never fewer than two pixels to a point: the paper is the page.
      const viewport = proxy.getViewport({ scale: Math.max(cssScale * dpr, 2) });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      c.style.width = `${width}px`;
      c.style.height = `${unit.height * cssScale}px`;
      renderTask = proxy.render({ canvasContext: c.getContext("2d")!, viewport });
      await renderTask.promise.catch(() => undefined);
      if (cancelled || !text.current) return;
      const layer = text.current;
      layer.replaceChildren();
      layer.style.setProperty("--scale-factor", String(cssScale));
      await new pdfjs.TextLayer({
        textContentSource: await proxy.getTextContent(),
        container: layer,
        viewport: proxy.getViewport({ scale: cssScale }),
      }).render();
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [near, pdf, page, width]);

  return (
    <div className="pdf__sheet" ref={holder}>
      <canvas ref={canvas} aria-label={`Page ${page}`} />
      <div className="textLayer" ref={text} />
    </div>
  );
}

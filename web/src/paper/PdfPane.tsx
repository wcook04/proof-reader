// The authors' PDF, drawn by pdf.js exactly as published. Passages are boxes
// computed from the PDF's own words at build time; the page never retypes the
// paper. Scrolling reports the passage at the reading line.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Passage } from "../app/edition";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const READING_LINE = 0.36;

export interface PdfHandle {
  scrollToPassage(id: string): void;
}

interface Props {
  url: string;
  sizes: [number, number][];
  passages: Passage[];
  active: string | null;
  lit: ReadonlySet<string>;
  onActive(id: string | null): void;
  onPick(id: string): void;
  onUserScroll(): void;
}

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane(props, ref) {
  const { url, sizes, passages, active, lit, onActive, onPick, onUserScroll } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const programmatic = useRef(0);

  useEffect(() => {
    let live = true;
    const task = pdfjs.getDocument(url);
    task.promise.then((doc) => live && setPdf(doc)).catch(() => undefined);
    return () => {
      live = false;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 28, 860)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const byPage = useMemo(() => {
    const map = new Map<number, Passage[]>();
    for (const p of passages) map.set(p.page, [...(map.get(p.page) ?? []), p]);
    return map;
  }, [passages]);

  const pageTop = useCallback((page: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    return el ? el.offsetTop : 0;
  }, []);

  const passageTop = useCallback(
    (p: Passage) => pageTop(p.page) + p.rects[0][1] * (width / sizes[p.page - 1][0]),
    [pageTop, sizes, width],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToPassage(id) {
        const passage = passages.find((p) => p.id === id);
        const el = scroller.current;
        if (!passage || !el) return;
        programmatic.current = Date.now() + 900;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const top = passageTop(passage) - el.clientHeight * READING_LINE;
        el.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
        // A background tab may never run the animation, so arrive regardless.
        window.setTimeout(() => {
          if (Math.abs(el.scrollTop - top) > 40) el.scrollTo({ top, behavior: "auto" });
        }, 950);
      },
    }),
    [passages, passageTop],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el || !width) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      if (Date.now() < programmatic.current) return;
      const line = el.scrollTop + el.clientHeight * READING_LINE;
      let best: Passage | null = null;
      let bestGap = el.clientHeight * 0.55;
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
    read();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [passages, passageTop, width, onActive]);

  const hit = (event: React.MouseEvent<HTMLDivElement>, page: number): string | null => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = sizes[page - 1][0] / box.width;
    const x = (event.clientX - box.left) * scale;
    const y = (event.clientY - box.top) * scale;
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
      {sizes.map(([w, h], index) => {
        const page = index + 1;
        const scale = width / w;
        return (
          <div
            key={page}
            className={`pdf__page${hover ? " has-hover" : ""}`}
            data-page={page}
            style={{ width, height: h * scale }}
            onMouseMove={(e) => setHover(hit(e, page))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              if (window.getSelection()?.toString()) return;
              const id = hit(e, page);
              if (id) onPick(id);
            }}
          >
            {pdf && width > 0 && <PageCanvas pdf={pdf} page={page} width={width} root={scroller} />}
            {(byPage.get(page) ?? []).flatMap((p) =>
              p.rects.map(([x0, y0, x1, y1], i) => (
                <span
                  key={`${p.id}${i}`}
                  className={`mark${p.id === active ? " is-active" : ""}${p.id === hover ? " is-hover" : ""}${lit.has(p.id) ? " is-lit" : ""}`}
                  style={{ left: (x0 - 1.5) * scale, top: (y0 - 1) * scale, width: (x1 - x0 + 3) * scale, height: (y1 - y0 + 2) * scale }}
                />
              )),
            )}
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
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { root: root.current, rootMargin: "900px 0px" });
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
      const viewport = proxy.getViewport({ scale: cssScale * dpr });
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

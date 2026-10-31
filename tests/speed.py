#!/usr/bin/env python3
"""How fast a paper's first screen arrives, on a network like a good home connection.

Serves web/dist from a process of its own, compressed as GitHub Pages compresses it, and
loads a paper in Chromium at about 9 Mbps and 170 ms. Prints the files fetched, their
compressed bytes, and the time until the paper's text is on the page.

    cd web && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
    python tests/speed.py [--runs 3]

Needs Playwright for Python.
"""
from __future__ import annotations

import argparse
import gzip
import http.server
import mimetypes
import socket
import socketserver
import statistics
import subprocess
import sys
import time
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PREFIX = "/proof-reader/"
SQUEEZED = (".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt")
FIRST = """new MutationObserver((_, watcher) => {
  const text = document.querySelector('.sheet__text p');
  if (text && text.textContent.length > 100) {
    window.__paperAt = performance.now();
    watcher.disconnect();
  }
}).observe(document, { childList: true, subtree: true });"""


class Squeezed(http.server.BaseHTTPRequestHandler):
    def __init__(self, *args, root: Path, **kwargs):
        self.root = root
        super().__init__(*args, **kwargs)

    def log_message(self, *args) -> None:
        pass

    def do_GET(self) -> None:
        path = self.path.split("?")[0].split("#")[0]
        file = self.root / path[len(PREFIX):] if path.startswith(PREFIX) else None
        if file and file.is_dir():
            file = file / "index.html"
        if not file or not file.is_file():
            self.send_response(404)
            self.end_headers()
            return
        body = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.send_header("Cache-Control", "no-store")
        if file.suffix in SQUEEZED:
            body = gzip.compress(body, 6)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        pass


def start(dist: Path) -> tuple[str, subprocess.Popen]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen([sys.executable, __file__, "--serve", str(dist), "--port", str(port)])
    for _ in range(100):
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.05)
    return f"http://127.0.0.1:{port}{PREFIX}", server


def once(browser, url: str, route: str) -> dict:
    context = browser.new_context(viewport={"width": 1440, "height": 790})
    page = context.new_page()
    page.add_init_script(FIRST)
    session = context.new_cdp_session(page)
    session.send("Network.enable")
    session.send("Network.setCacheDisabled", {"cacheDisabled": True})
    session.send("Network.emulateNetworkConditions", {"offline": False, "latency": 170, "downloadThroughput": 9e6 / 8, "uploadThroughput": 2e6 / 8})
    sizes: dict[str, int] = {}
    names: dict[str, str] = {}
    session.on("Network.responseReceived", lambda e: names.__setitem__(e["requestId"], e["response"]["url"]))
    session.on("Network.loadingFinished", lambda e: sizes.__setitem__(e["requestId"], e["encodedDataLength"]))
    page.goto(url + route, wait_until="load")
    page.wait_for_function("window.__paperAt > 0", timeout=60000)
    paper = page.evaluate("window.__paperAt")
    first_paint = page.evaluate("performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0")
    page.wait_for_timeout(2500)
    rows = sorted(((sizes[i], names.get(i, "?")) for i in sizes), reverse=True)
    context.close()
    return {"paper": paper, "paint": first_paint, "files": len(rows), "bytes": sum(r[0] for r in rows), "rows": rows}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dist", type=Path, default=ROOT / "web" / "dist")
    parser.add_argument("--route", default="#/contextual-embeddings")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--serve", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--port", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve:
        Server(("127.0.0.1", args.port), partial(Squeezed, root=args.serve)).serve_forever()
        return 0
    url, server = start(args.dist)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            results = [once(browser, url, args.route) for _ in range(args.runs)]
            browser.close()
    finally:
        server.terminate()
    last = results[-1]
    print(f"{last['files']} files, {last['bytes'] / 1024:.0f} KB compressed")
    print(f"first paint {statistics.median(r['paint'] for r in results):.0f} ms, paper text {statistics.median(r['paper'] for r in results):.0f} ms")
    for size, name in last["rows"][:14]:
        print(f"  {size / 1024:7.1f} KB  {name.rsplit('/', 1)[-1][:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

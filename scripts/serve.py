"""Local dev server: python3 scripts/serve.py [port]  →  http://localhost:8000

Same as `python3 -m http.server`, but tells the browser not to cache files,
so edits show up on reload. (The service worker still caches the app: in
Chrome DevTools > Application > Service workers, tick "Update on reload".)
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import functools
import sys


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


root = Path(__file__).resolve().parent.parent
handler = functools.partial(NoCacheHandler, directory=str(root))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print("Serving", root, f"at http://localhost:{port}", flush=True)
ThreadingHTTPServer(("", port), handler).serve_forever()

"""Local dev server: python3 scripts/serve.py  →  http://localhost:8000

Same as `python3 -m http.server`, but tells the browser not to cache files,
so edits show up on reload. (The service worker still caches the app: in
Chrome DevTools > Application > Service workers, tick "Update on reload".)
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import functools


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


root = Path(__file__).resolve().parent.parent
handler = functools.partial(NoCacheHandler, directory=str(root))
print("Serving", root, "at http://localhost:8000")
ThreadingHTTPServer(("", 8000), handler).serve_forever()

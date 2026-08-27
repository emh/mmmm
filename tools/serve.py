#!/usr/bin/env python3
"""
Static dev server that never caches.

ES modules are cached hard by the browser, and a stale module is a genuinely
confusing failure: the page half-works, using a mix of old and new code, and the
symptoms point everywhere except the real cause. Cache-busting query strings
have to be remembered on every edit and only cover the file you thought to bump.
Serving `no-store` removes the whole class of problem.

    python3 tools/serve.py [port]
"""
import io
import os
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


BUILD = str(int(time.time()))
IMPORT_RE = re.compile(rb'(\bfrom\s*|\bimport\s*\(\s*)([\'"])(\.{1,2}/[^\'"?]+\.js)\2')


class NoCacheHandler(SimpleHTTPRequestHandler):
    """
    Serves JS with a version stamped onto every relative import.

    `no-store` alone is not always enough: some embedded browsers keep serving a
    cached module graph regardless, and the failure is nasty -- the page runs a
    mix of old and new code, so the symptoms point everywhere except the stale
    file. Rewriting `from "./x.js"` to `from "./x.js?v=<build>"` changes the URL
    itself, which no cache can ignore. The stamp is fixed per server run, so a
    restart is what picks up edits.
    """

    def send_head(self):
        path = self.translate_path(self.path)
        if not path.endswith(".js") or not os.path.isfile(path):
            return super().send_head()

        with open(path, "rb") as f:
            body = IMPORT_RE.sub(
                lambda m: m.group(1) + m.group(2) + m.group(3) + b"?v=" + BUILD.encode() + m.group(2),
                f.read())

        self.send_response(200)
        self.send_header("Content-Type", "text/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet by default; 404s still matter, so keep those.
        if args and str(args[1]).startswith("4"):
            sys.stderr.write("  %s %s\n" % (args[1], args[0]))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    print(f"serving {port} with no-store")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()

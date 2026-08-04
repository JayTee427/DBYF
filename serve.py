"""Dev server for Don't Burn Your Feet — like `python -m http.server` but
sends no-cache headers so gameplay fixes actually reach the browser."""
import http.server
import os

PORT = 8123

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'DBYF dev server: http://localhost:{PORT} (no-cache)')
    http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()

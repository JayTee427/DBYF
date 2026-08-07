"""Dev server for Don't Burn Your Feet.

Like `python -m http.server`, but:
  * sends no-cache headers so gameplay fixes actually reach the browser
  * accepts POST /_shot (a base64 image body) and writes it to _shots/ so the
    game's rendering can be inspected without a live display
"""
import base64
import http.server
import os

PORT = 8123
SHOT_DIR = '_shots'


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith('/_shot'):
            self.send_error(404)
            return
        name = self.path.split('?name=')[-1] if '?name=' in self.path else 'shot'
        name = ''.join(c for c in name if c.isalnum() or c in '-_') or 'shot'
        length = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(length).decode('utf-8', 'replace')
        if ',' in payload[:64]:
            payload = payload.split(',', 1)[1]
        os.makedirs(SHOT_DIR, exist_ok=True)
        path = os.path.join(SHOT_DIR, name + '.jpg')
        with open(path, 'wb') as fh:
            fh.write(base64.b64decode(payload))
        body = path.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print('DBYF dev server: http://localhost:%d  (no-cache, /_shot capture)' % PORT)
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()

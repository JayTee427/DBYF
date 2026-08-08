"""Dev/host server for Don't Burn Your Feet.

Like `python -m http.server`, but:
  * sends no-cache headers so gameplay fixes actually reach the browser
  * persists the Hall of Soles to scores.json so initials survive browser
    wipes, machine changes and every revision of the game
      GET  /_scores        -> the whole table as JSON
      POST /_scores        -> one entry {ini, sc, df, lv}, merged and saved
  * accepts POST /_shot (base64 image) into _shots/ for headless inspection
"""
import base64
import http.server
import json
import os
import threading

PORT = 8123
SHOT_DIR = '_shots'
SCORES_FILE = 'scores.json'
MAX_SCORES = 25

_lock = threading.Lock()


def load_scores():
    try:
        with open(SCORES_FILE, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def save_scores(rows):
    tmp = SCORES_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, indent=1)
    os.replace(tmp, SCORES_FILE)          # atomic, so a crash can't shred the table


def clean(entry):
    """Never trust the client with the shape of our own save file."""
    ini = str(entry.get('ini', '???'))[:3].upper() or '???'
    try:
        sc = max(0, min(99999999, int(entry.get('sc', 0))))
    except (TypeError, ValueError):
        sc = 0
    return {
        'ini': ini,
        'sc': sc,
        'df': str(entry.get('df', ''))[:16],
        'lv': max(1, min(999, int(entry.get('lv', 1) or 1))),
        'at': str(entry.get('at', ''))[:24],
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _json(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/_scores'):
            with _lock:
                self._json(load_scores())
            return
        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)

        if self.path.startswith('/_scores'):
            try:
                entry = clean(json.loads(raw.decode('utf-8')))
            except (ValueError, AttributeError):
                self._json({'error': 'bad entry'}, 400)
                return
            with _lock:
                rows = load_scores()
                rows.append(entry)
                rows.sort(key=lambda r: r.get('sc', 0), reverse=True)
                del rows[MAX_SCORES:]
                save_scores(rows)
                self._json(rows)
            return

        if self.path.startswith('/_shot'):
            name = self.path.split('?name=')[-1] if '?name=' in self.path else 'shot'
            name = ''.join(c for c in name if c.isalnum() or c in '-_') or 'shot'
            payload = raw.decode('utf-8', 'replace')
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
            return

        self.send_error(404)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print('DBYF server: http://localhost:%d' % PORT)
    print('  Hall of Soles -> %s (%d entries kept)' % (SCORES_FILE, MAX_SCORES))
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()

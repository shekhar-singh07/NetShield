"""
NetShield-ML — Agent Local Web UI
Serves a single control page on 127.0.0.1:7000 for the local agent:
connect / disconnect / send test message, live status, and an event log.
Stdlib only — no extra dependencies.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>NetShield Agent</title>
<style>
  :root {
    --bg:#0f1419; --panel:#171e26; --border:#2a3441; --text:#e6edf3;
    --muted:#8b98a9; --primary:#4f8cff; --green:#3fb950; --red:#f85149; --amber:#d29922;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:var(--bg); color:var(--text); padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:12px; margin-bottom:20px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:16px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  label { font-size:12px; color:var(--muted); display:block; margin-bottom:4px; }
  input { background:var(--bg); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px 10px; font:inherit; width:180px; }
  input#port { width:90px; }
  button { font:inherit; border:1px solid var(--border); border-radius:6px; padding:8px 14px; cursor:pointer; background:var(--panel); color:var(--text); }
  button:hover { border-color:var(--primary); }
  button:disabled { opacity:.5; cursor:not-allowed; }
  #connect { color:var(--green); }
  #disconnect { color:var(--red); }
  #test { color:var(--primary); }
  #badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid; vertical-align:middle; }
  #badge.connected { color:var(--green); border-color:#3fb95055; background:#3fb95015; }
  #badge.disconnected { color:var(--red); border-color:#f8514955; background:#f8514915; }
  #badge.retrying { color:var(--amber); border-color:#d2992255; background:#d2992215; }
  .stats { display:flex; gap:40px; }
  .stat b { display:block; font-size:20px; margin-top:2px; }
  .stat span { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  #log { list-style:none; margin:0; padding:0; max-height:320px; overflow-y:auto; font-size:12px; }
  #log li { padding:4px 0; border-bottom:1px solid var(--border); display:flex; gap:10px; }
  #log .t { color:var(--muted); flex:none; }
  #log .e { flex:none; width:130px; font-weight:600; }
  #log .e.connected, #log .e.hello-ack, #log .e.probe-ack-sent { color:var(--green); }
  #log .e.heartbeat-sent { color:var(--muted); }
  #log .e.probe-received { color:var(--amber); }
  #log .e.disconnected { color:var(--red); }
  #log .d { color:var(--text); word-break:break-all; }
</style>
</head>
<body>
  <h1>NetShield Agent <span id="badge" class="disconnected">&hellip;</span></h1>
  <div class="sub">Local agent control &mdash; 127.0.0.1:7000</div>

  <div class="card">
    <div class="row">
      <div>
        <label for="host">Server IP</label>
        <input id="host" placeholder="192.168.1.50"/>
      </div>
      <div>
        <label for="port">TCP port</label>
        <input id="port" type="number" min="1" max="65535"/>
      </div>
      <div class="row" style="gap:8px">
        <button id="connect">Connect</button>
        <button id="disconnect">Disconnect</button>
        <button id="test">Send Test Message</button>
      </div>
    </div>
  </div>

  <div class="card stats">
    <div class="stat"><span>Heartbeats</span><b id="hb">0</b></div>
    <div class="stat"><span>Last RTT</span><b id="rtt">&mdash;</b></div>
  </div>

  <div class="card">
    <label>Event log (last 50)</label>
    <ul id="log"></ul>
  </div>

<script>
const $ = (id) => document.getElementById(id);
let seeded = false;

async function poll() {
  try {
    const res = await fetch('/api/agent/status');
    const s = await res.json();
    if (!seeded) {
      $('host').value = s.server || '';
      $('port').value = s.port || 5000;
      seeded = true;
    }
    const st = s.status || (s.connected ? 'connected' : 'disconnected');
    const badge = $('badge');
    badge.className = st;
    badge.textContent = st.toUpperCase();
    $('hb').textContent = s.heartbeat_count || 0;
    $('rtt').textContent = s.last_rtt_ms != null ? s.last_rtt_ms + ' ms' : '\u2014';
    $('connect').disabled = s.connected;
    $('disconnect').disabled = !s.connected && st !== 'retrying';
    const log = $('log');
    log.innerHTML = '';
    (s.recent_events || []).slice().reverse().forEach((e) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="t"></span><span class="e"></span><span class="d"></span>';
      li.querySelector('.t').textContent = e.time || '';
      const ev = li.querySelector('.e');
      ev.textContent = (e.event || '').replace(/_/g, ' ');
      ev.classList.add((e.event || '').replace(/_/g, '-'));
      li.querySelector('.d').textContent = e.detail || '';
      log.appendChild(li);
    });
  } catch (err) {
    const badge = $('badge');
    badge.className = 'disconnected';
    badge.textContent = 'OFFLINE';
  }
}

async function post(path, body) {
  await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  poll();
}

$('connect').onclick = () => post('/api/agent/connect', {
  host: $('host').value.trim(),
  port: Number($('port').value) || 5000,
});
$('disconnect').onclick = () => post('/api/agent/disconnect');
$('test').onclick = () => post('/api/agent/test');

poll();
setInterval(poll, 1000);
</script>
</body>
</html>
"""


def start_web_ui(agent, host="127.0.0.1", port=7000):
    """Serve the agent control page + JSON API on 127.0.0.1:7000 (daemon thread)."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):  # silence per-request logging
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            elif self.path == "/api/agent/status":
                self._send(200, agent.status_payload())
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid JSON"})
                return

            if self.path == "/api/agent/connect":
                host_val = str(body.get("host") or "").strip()
                port_val = body.get("port")
                if host_val:
                    agent.host = host_val
                if isinstance(port_val, int) and 0 < port_val < 65536:
                    agent.port = port_val
                agent.connect()
                self._send(200, {"ok": True, **agent.status_payload()})
            elif self.path == "/api/agent/disconnect":
                agent.disconnect()
                self._send(200, {"ok": True, **agent.status_payload()})
            elif self.path == "/api/agent/test":
                ok = agent.send_test_message()
                self._send(200, {"ok": ok, **agent.status_payload()})
            else:
                self._send(404, {"error": "not found"})

    server = ThreadingHTTPServer((host, port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

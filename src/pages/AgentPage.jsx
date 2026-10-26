/**
 * AgentPage — Full native React UI for Computer A (agent role).
 * Connects to the local agent server at http://localhost:7001
 * No iframe, no terminal commands needed.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AgentConnectionBar from '../components/AgentConnectionBar';
import AgentPeerList from '../components/AgentPeerList';
import AgentIncomingRequests from '../components/AgentIncomingRequests';
import AgentChatWindow from '../components/AgentChatWindow';

const AGENT_API = 'http://localhost:7001';

async function agentFetch(path, opts = {}) {
  const res = await fetch(`${AGENT_API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Agent API ${path}: ${res.status}`);
  return res.json();
}

// ── Mini toast ──
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/50 px-4 py-2.5 rounded-lg shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2 animate-bounce">
      <span className="material-symbols-outlined text-[17px]">info</span>
      <span>{msg}</span>
    </div>
  );
}

// ── Status badge ──
function StatusBadge({ status }) {
  const cfg = {
    connected: {
      cls: 'bg-secondary/15 text-secondary border-secondary/30',
      dot: 'bg-secondary animate-pulse',
      label: 'CONNECTED',
    },
    retrying: {
      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400 animate-pulse',
      label: 'CONNECTING…',
    },
    disconnected: {
      cls: 'bg-surface-container text-outline border-outline-variant',
      dot: 'bg-outline',
      label: 'DISCONNECTED',
    },
  }[status] || {
    cls: 'bg-surface-container text-outline border-outline-variant',
    dot: 'bg-outline',
    label: status?.toUpperCase() || 'UNKNOWN',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── RTT sparkline mini chart ──
function RttSparkline({ history }) {
  if (!history || history.length < 2) {
    return (
      <div className="h-10 flex items-center justify-center text-outline font-mono text-[11px]">
        Collecting RTT data…
      </div>
    );
  }
  const max = Math.max(...history, 1);
  const w = 180;
  const h = 40;
  const step = w / (history.length - 1);
  const points = history.map((v, i) => `${i * step},${h - (v / max) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-secondary" />
      {history.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * (h - 4)} r="2" className="fill-secondary" />
      ))}
    </svg>
  );
}

// ── Event log row ──
function EventRow({ event }) {
  const colorMap = {
    connected: 'text-secondary',
    'hello-ack': 'text-secondary',
    'probe-ack-sent': 'text-secondary',
    'heartbeat-sent': 'text-outline',
    'probe-received': 'text-amber-400',
    disconnected: 'text-error',
    error: 'text-error',
  };
  const key = (event.event || '').replace(/_/g, '-');
  const color = colorMap[key] || 'text-on-surface-variant';
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-outline-variant/30 font-mono text-[11px] last:border-0">
      <span className="text-outline shrink-0 w-16">{event.time}</span>
      <span className={`shrink-0 w-28 font-semibold ${color}`}>
        {(event.event || '').replace(/_/g, ' ')}
      </span>
      <span className="text-on-surface-variant break-all">{event.detail}</span>
    </div>
  );
}

// ── Main component ──
export default function AgentPage() {
  const [status, setStatus] = useState(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5000');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simType, setSimType] = useState('port_scan');
  const [simResult, setSimResult] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [rttHistory, setRttHistory] = useState([]);
  const rttRef = useRef([]);

  // ── Multi-Agent State ──
  const [agentState, setAgentState] = useState({});
  const [selectedPeerId, setSelectedPeerId] = useState(null);
  const [peerRequestLoading, setPeerRequestLoading] = useState(null);
  const [respondLoading, setRespondLoading] = useState(null);
  const [chatSendLoading, setChatSendLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  // Poll agent status every 1.5s
  const poll = useCallback(async () => {
    try {
      const s = await agentFetch('/api/agent/status');
      setStatus(s);
      setAgentOnline(true);
      if (s.last_rtt_ms != null) {
        rttRef.current = [...rttRef.current.slice(-19), s.last_rtt_ms];
        setRttHistory([...rttRef.current]);
      }
    } catch {
      setAgentOnline(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  // Poll agent multi-agent state every 1.0s
  const pollAgentState = useCallback(async () => {
    try {
      const st = await agentFetch('/agent/state');
      setAgentState(st || {});
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    pollAgentState();
    const id = setInterval(pollAgentState, 1000);
    return () => clearInterval(id);
  }, [pollAgentState]);

  // Multi-agent actions
  const handleConnectPeer = async (peerId) => {
    setPeerRequestLoading(peerId);
    try {
      const res = await agentFetch('/agent/connect-request', {
        method: 'POST',
        body: JSON.stringify({ to: peerId }),
      });
      if (res.success) {
        showToast(res.message || `Request sent to ${peerId}`);
      } else {
        showToast(`Request failed: ${res.error}`);
      }
      pollAgentState();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setPeerRequestLoading(null);
    }
  };

  const handleRespondRequest = async (fromPeerId, accept) => {
    setRespondLoading(fromPeerId);
    try {
      const res = await agentFetch('/agent/respond', {
        method: 'POST',
        body: JSON.stringify({ from: fromPeerId, accept }),
      });
      showToast(res.message || (accept ? 'Connected' : 'Declined'));
      pollAgentState();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setRespondLoading(null);
    }
  };

  const handleSendMessage = async (toPeerId, text) => {
    setChatSendLoading(true);
    try {
      const res = await agentFetch('/agent/send', {
        method: 'POST',
        body: JSON.stringify({ to: toPeerId, text }),
      });
      if (!res.success) {
        showToast(res.error || 'Failed to send message');
      }
      pollAgentState();
    } catch (err) {
      showToast(`Send error: ${err.message}`);
    } finally {
      setChatSendLoading(false);
    }
  };

  const handleAgentReconnect = async () => {
    setReconnecting(true);
    try {
      await agentFetch('/agent/reconnect', { method: 'POST' });
      showToast('Reconnecting agent...');
      pollAgentState();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setReconnecting(false);
    }
  };

  const handleUpdateSettings = async (settings) => {
    try {
      const res = await agentFetch('/agent/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
      showToast(res.message || 'Settings saved');
      pollAgentState();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!host.trim()) return;
    setConnecting(true);
    setSimResult(null);
    try {
      const res = await agentFetch('/api/agent/connect', {
        method: 'POST',
        body: JSON.stringify({ host: host.trim(), port: Number(port) || 5000 }),
      });
      if (res.success) {
        showToast(`Connected to ${host.trim()}:${port}`);
      } else {
        showToast(`Failed: ${res.error}`);
      }
      poll();
    } catch (err) {
      showToast(`Connection error: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setSimResult(null);
    rttRef.current = [];
    setRttHistory([]);
    try {
      await agentFetch('/api/agent/disconnect', { method: 'POST' });
      showToast('Disconnected from server.');
      poll();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    setTestLoading(true);
    try {
      const res = await agentFetch('/api/agent/test', { method: 'POST' });
      if (res.success) {
        showToast('Test message sent successfully.');
      } else {
        showToast(`Test failed: ${res.message}`);
      }
      poll();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await agentFetch('/api/agent/simulate', {
        method: 'POST',
        body: JSON.stringify({
          attack_type: simType,
          target_host: status?.server_host || host.trim(),
        }),
      });
      setSimResult(res);
      showToast(`Simulation '${simType}' started against ${res.target}`);
    } catch (err) {
      showToast(`Simulation error: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const isConnected = status?.status === 'connected';
  const isRetrying = status?.status === 'retrying';

  // ── Agent server not running ──
  if (!agentOnline) {
    return (
      <div className="flex flex-col gap-4">
        <Toast msg={toastMsg} />
        <div className="bg-error-container/10 border border-error/30 rounded-xl p-6 text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-error text-[48px]">cloud_off</span>
          <div>
            <h2 className="text-lg font-bold text-on-surface">Agent Server Not Running</h2>
            <p className="mt-2 text-sm text-on-surface-variant max-w-md">
              The local agent server is offline. Start it by running this command once on this computer:
            </p>
          </div>
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-lg p-3 font-mono text-[12px] text-primary text-left">
            python agent/agent_server.py
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            Or double-click <strong>start_agent.bat</strong> if you have it.
          </p>
          <button
            onClick={poll}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary/20 border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/30 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Toast msg={toastMsg} />

      {/* ── Header card ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[28px]">lan</span>
            <div>
              <div className="font-mono text-[13px] font-bold text-on-surface uppercase tracking-wider">
                NetShield Agent
              </div>
              <div className="font-mono text-[11px] text-on-surface-variant mt-0.5">
                {status?.hostname || '—'} · {status?.local_ip || '—'}
              </div>
            </div>
          </div>
          <StatusBadge status={status?.status || 'disconnected'} />
        </div>
      </div>

      {/* ── Agent Connection & Multi-Agent Status Bar ── */}
      <AgentConnectionBar
        state={agentState}
        onReconnect={handleAgentReconnect}
        onUpdateSettings={handleUpdateSettings}
        reconnecting={reconnecting}
      />

      {/* ── Incoming Requests ── */}
      <AgentIncomingRequests
        requests={agentState.incoming_requests || []}
        onRespond={handleRespondRequest}
        respondLoading={respondLoading}
      />

      {/* ── Peer Discovery & Inter-Agent Chat ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <AgentPeerList
            peers={agentState.peers || []}
            selectedPeerId={selectedPeerId}
            activeSessions={agentState.active_sessions || []}
            onSelectPeer={(pid) => setSelectedPeerId(pid)}
            onConnectRequest={handleConnectPeer}
            requestLoading={peerRequestLoading}
          />
        </div>

        <div className="lg:col-span-7">
          <AgentChatWindow
            selectedPeer={
              (agentState.peers || []).find((p) => p.agent_id === selectedPeerId) ||
              (selectedPeerId ? { agent_id: selectedPeerId, name: selectedPeerId, status: 'offline' } : null)
            }
            messages={(agentState.conversations || {})[selectedPeerId] || []}
            currentAgentId={agentState.agent_id || ''}
            hasActiveSession={(agentState.active_sessions || []).includes(selectedPeerId)}
            onSendMessage={handleSendMessage}
            sendLoading={chatSendLoading}
          />
        </div>
      </div>

      {/* ── Main grid (Diagnostics & Simulation Lab) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Connect panel ── */}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary">link</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Server Connection
            </span>
          </div>

          {!isConnected && !isRetrying ? (
            <form onSubmit={handleConnect} className="flex flex-col gap-3">
              <label className="block text-sm text-on-surface">
                <span className="font-mono text-[11px] uppercase tracking-wider text-outline">Server IP (Computer B)</span>
                <input
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.50"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm text-on-surface">
                <span className="font-mono text-[11px] uppercase tracking-wider text-outline">TCP Port</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="65535"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                disabled={connecting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60 disabled:cursor-wait hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {connecting ? 'progress_activity' : 'link'}
                </span>
                {connecting ? 'Connecting…' : 'Connect to Server'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Connected info */}
              <div className="bg-surface-container-lowest rounded-lg border border-secondary/30 p-3 space-y-2 font-mono text-[12px]">
                <div className="flex justify-between">
                  <span className="text-outline">Server</span>
                  <span className="text-on-surface font-semibold">
                    {status?.server_host}:{status?.server_port}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">Status</span>
                  <span className={isConnected ? 'text-secondary font-semibold' : 'text-amber-400'}>
                    {isConnected ? 'Connected' : 'Connecting…'}
                  </span>
                </div>
                {status?.last_rtt_ms != null && (
                  <div className="flex justify-between">
                    <span className="text-outline">Last RTT</span>
                    <span className="text-primary font-semibold">{status.last_rtt_ms} ms</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-outline">Heartbeats</span>
                  <span className="text-on-surface">{status?.heartbeat_count ?? 0}</span>
                </div>
              </div>

              <div className="flex gap-2">
                {isConnected && (
                  <button
                    onClick={handleTest}
                    disabled={testLoading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/20 border border-secondary/40 px-3 py-2 text-sm font-semibold text-secondary hover:bg-secondary/30 disabled:opacity-50 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    {testLoading ? 'Sending…' : 'Send Test'}
                  </button>
                )}
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-error-container/20 border border-error/40 px-3 py-2 text-sm font-semibold text-error hover:bg-error-container/30 disabled:opacity-50 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">link_off</span>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RTT & Stats ── */}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2.5">
            <span className="material-symbols-outlined text-[18px] text-secondary">monitoring</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Connection Health
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-container-lowest rounded-lg p-3 text-center border border-outline-variant/60">
              <div className="font-mono text-[22px] font-bold text-primary">
                {status?.last_rtt_ms != null ? `${status.last_rtt_ms}` : '—'}
              </div>
              <div className="font-mono text-[10px] text-outline uppercase tracking-wider mt-1">RTT (ms)</div>
            </div>
            <div className="bg-surface-container-lowest rounded-lg p-3 text-center border border-outline-variant/60">
              <div className="font-mono text-[22px] font-bold text-secondary">
                {status?.heartbeat_count ?? 0}
              </div>
              <div className="font-mono text-[10px] text-outline uppercase tracking-wider mt-1">Heartbeats</div>
            </div>
          </div>

          {/* RTT sparkline */}
          <div className="bg-surface-container-lowest rounded-lg p-3 border border-outline-variant/60">
            <div className="font-mono text-[10px] uppercase tracking-wider text-outline mb-2">RTT History</div>
            <RttSparkline history={rttHistory} />
          </div>
        </div>
      </div>

      {/* ── Attack Simulation Lab ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2.5 mb-4">
          <span className="material-symbols-outlined text-[18px] text-tertiary">science</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Attack Simulation Lab
          </span>
          {!isConnected && (
            <span className="ml-auto font-mono text-[11px] text-outline">Connect to server first</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-outline">Simulation Type</span>
            <select
              value={simType}
              onChange={(e) => setSimType(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface font-mono text-[12px] outline-none focus:border-primary"
            >
              <option value="port_scan">🔍 Port Scan</option>
              <option value="traffic_spike">📈 Traffic Spike (UDP Flood)</option>
              <option value="connection_burst">⚡ Connection Burst</option>
              <option value="normal">✅ Normal Traffic</option>
            </select>
          </div>

          <button
            onClick={handleSimulate}
            disabled={!isConnected || simLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-tertiary/20 border border-tertiary-container/50 px-4 py-2 text-sm font-semibold text-tertiary hover:bg-tertiary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">
              {simLoading ? 'progress_activity' : 'play_circle'}
            </span>
            {simLoading ? 'Running…' : 'Run Simulation'}
          </button>
        </div>

        {simResult && (
          <div className="mt-3 bg-surface-container-lowest rounded-lg border border-tertiary-container/40 p-3 font-mono text-[12px]">
            <div className="flex items-center gap-2 text-tertiary font-semibold mb-1">
              <span className="material-symbols-outlined text-[15px]">check_circle</span>
              {simResult.message}
            </div>
            <div className="text-on-surface-variant">
              Attack: <span className="text-on-surface">{simResult.attack_type}</span> → Target: <span className="text-primary">{simResult.target}</span>
            </div>
            <div className="mt-1 text-outline text-[11px]">
              Watch the Security and Monitoring pages on Computer B for detection events.
            </div>
          </div>
        )}
      </div>

      {/* ── Event Log ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-outline">list_alt</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Event Log
            </span>
          </div>
          <span className="font-mono text-[11px] text-outline">Last 50 events</span>
        </div>

        <div className="max-h-52 overflow-y-auto">
          {status?.recent_events && status.recent_events.length > 0 ? (
            [...status.recent_events].reverse().map((ev, i) => (
              <EventRow key={i} event={ev} />
            ))
          ) : (
            <div className="text-center font-mono text-[12px] text-outline py-6">
              No events yet — connect to a server to start seeing activity.
            </div>
          )}
        </div>
      </div>

      {/* ── Instructions ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px] text-outline">help</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            How to use
          </span>
        </div>
        <ol className="text-sm text-on-surface-variant space-y-2 list-decimal list-inside font-mono text-[12px]">
          <li>On <strong className="text-on-surface">Computer B (Server)</strong>: run NetShield with <code className="text-primary">python -m uvicorn backend.main:app ...</code> and open the dashboard</li>
          <li>On <strong className="text-on-surface">this computer</strong>: enter Computer B's IP address above and click <em>Connect to Server</em></li>
          <li>Watch the <strong className="text-on-surface">Devices page</strong> on Computer B — it will show this agent as connected</li>
          <li>Use the <strong className="text-on-surface">Attack Simulation Lab</strong> to trigger detection events on Computer B</li>
        </ol>
      </div>
    </div>
  );
}

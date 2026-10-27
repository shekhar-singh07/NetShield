/**
 * DevicesPage — server & agent status, probe test, connect command, details.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchDevices, fetchStatus, fetchAgents, quarantineAgent, releaseAgent, fetchQuarantinePolicy } from '../api';
import { DisconnectedBanner } from './OverviewPage';
import AgentControlPanel from '../components/AgentControlPanel';

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function DevicesPage({ backendConnected }) {
  const [devices, setDevices] = useState(null);
  const [status, setStatus] = useState(null);
  const [agents, setAgents] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [probeVerified, setProbeVerified] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [agentBusy, setAgentBusy] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const [a, pol] = await Promise.all([fetchAgents(), fetchQuarantinePolicy().catch(() => null)]);
      setAgents(a.agents || []);
      if (pol) setPolicy(pol);
    } catch {
      // Agents panel fails soft; device telemetry is unaffected
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([fetchDevices(), fetchStatus()]);
      setDevices(d);
      setStatus(s);
    } catch {
      // Polling failover
    }
  }, []);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [d, s] = await Promise.all([fetchDevices(), fetchStatus()]);
        if (!active) return;
        setDevices(d);
        setStatus(s);
      } catch {
        // Handle polling failover
      }
    };

    poll();
    loadAgents();
    const id = setInterval(() => { poll(); loadAgents(); }, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [backendConnected, loadAgents]);

  const handleQuarantine = useCallback(async (agentId) => {
    setAgentBusy(agentId);
    try {
      const res = await quarantineAgent(agentId);
      if (res?.success) {
        showToast(`Agent '${agentId}' quarantined.`);
        await loadAgents();
      } else {
        showToast(`Failed to quarantine '${agentId}': ${res?.error || 'server error'}`);
      }
    } catch (e) {
      showToast(`Failed to quarantine '${agentId}': ${e.message}`);
    } finally {
      setAgentBusy(null);
    }
  }, [loadAgents, showToast]);

  const handleRelease = useCallback(async (agentId) => {
    setAgentBusy(agentId);
    try {
      const res = await releaseAgent(agentId);
      if (res?.success) {
        showToast(`Agent '${agentId}' released from quarantine.`);
        await loadAgents();
      } else {
        showToast(`Failed to release '${agentId}': ${res?.error || 'server error'}`);
      }
    } catch (e) {
      showToast(`Failed to release '${agentId}': ${e.message}`);
    } finally {
      setAgentBusy(null);
    }
  }, [loadAgents, showToast]);

  const isRemoteConnected = devices?.remote?.status === 'connected';

  const [wasConnected, setWasConnected] = useState(isRemoteConnected);
  if (isRemoteConnected !== wasConnected) {
    setWasConnected(isRemoteConnected);
    if (!isRemoteConnected) setProbeVerified(false);
  }

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  const local = devices?.local || {};
  const remote = devices?.remote || {};
  const tcpServer = devices?.tcp_server || {};
  const agentStatus = remote.status;
  const serverPort = tcpServer.port || 5000;

  const heartbeatSeq = /Heartbeat #(\d+)/.exec(remote.last_message || '');
  const seqText = heartbeatSeq
    ? `#${heartbeatSeq[1]}`
    : agentStatus === 'connected' ? '#0' : '—';

  const lostAgo = remote.last_heartbeat ? timeAgo(remote.last_heartbeat) : null;

  let banner;
  if (isRemoteConnected) {
    banner = {
      tone: 'bg-secondary/10 border-secondary/30 text-secondary',
      icon: 'check_circle',
      text: `Agent connected · heartbeat OK${remote.rtt_ms != null ? ` · RTT ${remote.rtt_ms} ms` : ''}`,
      next: 'Next: run a probe, then open Security.',
    };
  } else if (agentStatus === 'connecting') {
    banner = {
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: 'hourglass_top',
      text: 'Connecting to agent.',
      next: 'Next: wait for the handshake.',
    };
  } else if (lostAgo) {
    banner = {
      tone: 'bg-error-container/20 border-error/40 text-error',
      icon: 'link_off',
      text: `Connection lost ${lostAgo}`,
      next: 'Next: run the command below on the other computer.',
    };
  } else {
    banner = {
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: 'hourglass_top',
      text: 'Waiting for agent.',
      next: 'Next: run the command below on the other computer.',
    };
  }

  const steps = [
    { label: `Server listening (${local.ip || '—'}:${serverPort})`, done: !!tcpServer.running },
    { label: 'Agent connected', done: isRemoteConnected },
    { label: 'Probe verified', done: probeVerified },
  ];

  const clientCmd = `python backend/networking/client.py --host ${local.ip || '192.168.x.x'} --port ${serverPort}`;

  const copyCommand = () => {
    navigator.clipboard.writeText(clientCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2200);
    showToast('Copied command to clipboard.');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toast Notification ── */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/50 px-3.5 py-2.5 rounded-lg shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Status banner ── */}
      <div className={`flex items-start gap-2.5 rounded-lg border p-3.5 ${banner.tone}`}>
        <span className="material-symbols-outlined text-[20px] leading-none">{banner.icon}</span>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] font-semibold">{banner.text}</span>
          <span className="font-mono text-[12px] opacity-90">{banner.next}</span>
        </div>
      </div>

      {/* ── Setup tracker ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {steps.map((step, i) => (
          <div
            key={step.label}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
              step.done
                ? 'bg-secondary/10 border-secondary/30'
                : 'bg-surface-container-low border-outline-variant'
            }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 shrink-0 rounded-full font-mono text-[11px] font-bold ${
                step.done
                  ? 'bg-secondary/20 text-secondary'
                  : 'bg-surface-container text-outline'
              }`}
            >
              {step.done ? (
                <span className="material-symbols-outlined text-[15px]">check</span>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`font-mono text-[12px] ${step.done ? 'text-on-surface' : 'text-outline'}`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Device cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">dns</span>
              <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
                This computer (Server)
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold border bg-primary/15 text-primary border-primary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              ONLINE
            </span>
          </div>
          <div className="font-mono text-[12px] space-y-2">
            <div className="flex justify-between">
              <span className="text-outline">Hostname</span>
              <span className="text-on-surface font-medium">{local.hostname || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-outline">IP</span>
              <span className="text-on-surface font-medium">{local.ip || '—'}</span>
            </div>
          </div>
        </div>

        <div
          className={`rounded-lg border p-4 shadow-xs ${
            isRemoteConnected
              ? 'bg-surface-container-high border-secondary/40'
              : 'bg-surface-container-low border-outline-variant'
          }`}
        >
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`material-symbols-outlined text-[18px] ${isRemoteConnected ? 'text-secondary' : 'text-outline'}`}
              >
                computer
              </span>
              <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
                Remote agent
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold border ${
                isRemoteConnected
                  ? 'bg-secondary/15 text-secondary border-secondary/30'
                  : 'bg-surface-container text-outline border-outline-variant'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isRemoteConnected ? 'bg-secondary' : 'bg-outline'}`} />
              {isRemoteConnected ? 'CONNECTED' : 'WAITING'}
            </span>
          </div>
          <div className="font-mono text-[12px] space-y-2">
            <div className="flex justify-between">
              <span className="text-outline">Hostname</span>
              <span className="text-on-surface font-medium">{remote.hostname || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-outline">IP</span>
              <span className="text-on-surface font-medium">{remote.ip || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-outline">RTT</span>
              <span className="text-secondary font-medium">
                {remote.rtt_ms != null ? `${remote.rtt_ms} ms` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Registered Agents panel ── */}
      <div className="flex flex-col bg-surface-container-low border border-outline-variant rounded-lg shadow-xs overflow-hidden">
        <div className="h-11 px-3.5 flex flex-wrap items-center justify-between border-b border-outline-variant bg-surface-container-lowest gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary">sensors</span>
            <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">
              Registered Agents
            </span>
            <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-mono text-[11px] font-semibold border border-primary/30">
              {agents.length} total
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/15 text-secondary font-mono text-[10px] font-semibold border border-secondary/30">
              <span className="material-symbols-outlined text-[12px]">security</span>
              Auto-Defense: {policy?.enabled ? `${policy.cooldown_seconds || 60}s TTL (Whitelist Protected)` : 'Disabled'}
            </span>
          </div>
          <button
            onClick={loadAgents}
            className="h-7.5 w-7.5 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all"
            title="Refresh agents"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-7 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                <th className="px-3 font-medium">Agent Name</th>
                <th className="px-3 font-medium">Status</th>
                <th className="px-3 font-medium">IP</th>
                <th className="px-3 font-medium w-24">RTT</th>
                <th className="px-3 font-medium">Last Seen</th>
                <th className="px-3 font-medium text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 text-[12px] font-mono">
              {agents.map((a) => (
                <tr key={a.agent_id} className="h-7.5 hover:bg-surface-container-high/60 transition-colors">
                  <td className="px-3 text-on-surface font-medium">{a.name || a.agent_id}</td>
                  <td className="px-3">
                    {a.quarantined ? (
                      a.quarantine_type === 'auto' ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border bg-amber-500/20 text-amber-300 border-amber-500/40"
                          title={a.quarantine_reason || 'Suspicious traffic detected by NIDS'}
                        >
                          <span className="material-symbols-outlined text-[12px] animate-spin">timelapse</span>
                          AUTO-QUARANTINED {a.quarantine_remaining_seconds != null ? `(${a.quarantine_remaining_seconds}s)` : ''}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border bg-error-container/40 text-error border-error-container"
                          title={a.quarantine_reason || 'Manually quarantined'}
                        >
                          <span className="w-1 h-1 rounded-full bg-error" />
                          QUARANTINED (MANUAL)
                        </span>
                      )
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${
                        a.status === 'online'
                          ? 'bg-secondary/15 text-secondary border-secondary/30'
                          : 'bg-surface-container text-outline border-outline-variant'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${a.status === 'online' ? 'bg-secondary' : 'bg-outline'}`} />
                        {(a.status || 'unknown').toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 text-on-surface">{a.ip || '—'}</td>
                  <td className="px-3 text-secondary">
                    {a.rtt_ms != null ? `${a.rtt_ms} ms` : '—'}
                  </td>
                  <td className="px-3 text-outline">{timeAgo(a.last_seen) || '—'}</td>
                  <td className="px-3 text-right">
                    {a.quarantined ? (
                      <button
                        disabled={agentBusy === a.agent_id}
                        onClick={() => handleRelease(a.agent_id)}
                        className="px-2 py-1 rounded bg-secondary/15 hover:bg-secondary/25 text-secondary font-mono text-[11px] font-semibold border border-secondary/30 transition-all active:scale-95 disabled:opacity-40"
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">lock_open</span>
                          {a.quarantine_type === 'auto' ? 'Release Early' : 'Release'}
                        </span>
                      </button>
                    ) : (
                      <button
                        disabled={agentBusy === a.agent_id}
                        onClick={() => handleQuarantine(a.agent_id)}
                        className="px-2 py-1 rounded bg-error-container/30 hover:bg-error-container/50 text-error font-mono text-[11px] font-semibold border border-error/30 transition-all active:scale-95 disabled:opacity-40"
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">gpp_bad</span>
                          Quarantine
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-outline font-mono text-[11px]">
                    No agents registered yet. Agents appear here once they register with the pairing code.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Agent controls & probe test ── */}
      <AgentControlPanel
        isConnected={isRemoteConnected}
        remoteDevice={remote}
        onRefresh={refreshDevices}
        onToast={showToast}
        onProbeResult={setProbeVerified}
      />

      {/* ── Connect command (only when no agent) ── */}
      {!isRemoteConnected && (
        <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-outline text-[18px]">terminal</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface">
              Run on the other computer
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg p-2.5 font-mono text-[12px]">
            <code className="text-primary truncate select-all">{clientCmd}</code>
            <button
              onClick={copyCommand}
              className="shrink-0 px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedCmd ? 'check' : 'content_copy'}
              </span>
              <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Details ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 shadow-xs">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">info</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Details
            </span>
          </span>
          <span className="flex items-center gap-1 text-primary hover:text-secondary font-mono text-[12px] font-medium transition-colors">
            <span>{showDetails ? 'Hide' : 'Show'}</span>
            <span className="material-symbols-outlined text-[16px]">
              {showDetails ? 'expand_less' : 'expand_more'}
            </span>
          </span>
        </button>

        {showDetails && (
          <div className="mt-3.5 pt-3.5 border-t border-outline-variant grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[12px]">
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/60 p-3.5 space-y-2">
              <div className="text-secondary font-semibold uppercase tracking-wider border-b border-outline-variant/40 pb-2">
                Agent
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Heartbeat sequence</span>
                <span className="text-on-surface">{seqText}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Last heartbeat</span>
                <span className="text-on-surface">{remote.last_heartbeat || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Connected at</span>
                <span className="text-on-surface">{remote.connected_since || '—'}</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/60 p-3.5 space-y-2">
              <div className="text-primary font-semibold uppercase tracking-wider border-b border-outline-variant/40 pb-2">
                Server · FastAPI + TShark
              </div>
              <div className="flex justify-between">
                <span className="text-outline">TCP listener</span>
                <span className={tcpServer.running ? 'text-emerald-300 font-semibold' : 'text-outline'}>
                  {tcpServer.running ? `LISTENING (${tcpServer.host}:${serverPort})` : 'STANDBY'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Ports</span>
                <span className="text-on-surface">
                  TCP {serverPort} · API {status?.api_server?.port ?? 8000}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Packet capture</span>
                <span className={status?.packet_capture?.running ? 'text-emerald-300' : 'text-outline'}>
                  {status?.packet_capture?.running ? 'TShark live' : 'Synthetic mode'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Uptime</span>
                <span className="text-on-surface-variant">
                  {status?.uptime_seconds ? `${Math.floor(status.uptime_seconds)}s` : '0s'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * DevicesPage — Connected Devices, Agent Status & Network Topology
 * Ownership: Agent/server topology, connection state, configuration, and expandable device diagnostics.
 * Employs progressive disclosure for detailed socket telemetry and raw heartbeat sequences.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchDevices, fetchStatus } from '../api';
import { DisconnectedBanner } from './OverviewPage';
import AgentControlPanel from '../components/AgentControlPanel';

export default function DevicesPage({ backendConnected }) {
  const [devices, setDevices] = useState(null);
  const [status, setStatus] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
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
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [backendConnected]);

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  const local = devices?.local || {};
  const remote = devices?.remote || {};
  const tcpServer = devices?.tcp_server || {};
  const isRemoteConnected = remote.status === 'connected';

  const clientCmd = `python backend/networking/client.py --host ${local.ip || '192.168.x.x'} --port ${tcpServer.port || 5000}`;

  const copyCommand = () => {
    navigator.clipboard.writeText(clientCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2200);
    showToast('Copied client command to clipboard.');
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

      {/* ── Network Topology Visualization ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">hub</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Network Topology &amp; Agent Channel
            </span>
          </div>
          <span className="font-mono text-[11px] text-outline">
            {isRemoteConnected ? 'Telemetry Link Active' : 'Standby / Listening on 0.0.0.0'}
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Node 1: Computer A (Agent) */}
          <div
            className={`flex-1 w-full p-3.5 rounded-lg border transition-all ${
              isRemoteConnected
                ? 'bg-surface-container-high border-secondary/40 shadow-xs'
                : 'bg-surface-container-lowest border-outline-variant/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <span className={`material-symbols-outlined text-[22px] ${isRemoteConnected ? 'text-secondary' : 'text-outline'}`}>
                  computer
                </span>
                <div>
                  <div className="font-mono text-[10px] text-outline uppercase tracking-wider">COMPUTER A (AGENT)</div>
                  <div className="text-[14px] font-semibold text-on-surface">
                    {remote.hostname || (isRemoteConnected ? 'Remote Client' : 'No Agent Connected')}
                  </div>
                </div>
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

            <div className="font-mono text-[12px] space-y-1.5 text-on-surface-variant pt-1 border-t border-outline-variant/40">
              <div className="flex justify-between">
                <span className="text-outline">Socket Endpoint:</span>
                <span className="text-on-surface font-medium">{remote.ip ? `${remote.ip}:${remote.port}` : 'Waiting on :5000'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Round-Trip RTT:</span>
                <span className="text-secondary font-medium">{remote.rtt_ms != null ? `${remote.rtt_ms} ms` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Connection Channel (Middle) */}
          <div className="flex flex-col items-center justify-center px-2 py-1">
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider mb-1">
              TCP Socket (Port {tcpServer.port || 5000})
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`h-0.5 w-10 sm:w-16 ${isRemoteConnected ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
              <div className={`p-1.5 rounded-full border ${
                isRemoteConnected
                  ? 'bg-secondary/15 text-secondary border-secondary/40'
                  : 'bg-surface-container text-outline border-outline-variant'
              }`}>
                <span className="material-symbols-outlined text-[18px]">
                  {isRemoteConnected ? 'sync_alt' : 'link_off'}
                </span>
              </div>
              <div className={`h-0.5 w-10 sm:w-16 ${isRemoteConnected ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
            </div>
            <span className="font-mono text-[10px] text-outline-variant mt-1.5">
              {isRemoteConnected ? 'Heartbeat Active (3s Loop)' : 'Listening for Incoming Stream'}
            </span>
          </div>

          {/* Node 2: Computer B (Server / NIDS) */}
          <div className="flex-1 w-full p-3.5 rounded-lg border bg-surface-container-high border-primary/40 shadow-xs">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[22px] text-primary">dns</span>
                <div>
                  <div className="font-mono text-[10px] text-outline uppercase tracking-wider">COMPUTER B (SERVER / NIDS)</div>
                  <div className="text-[14px] font-semibold text-on-surface">
                    {local.hostname || 'Local Machine'}
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold border bg-primary/15 text-primary border-primary/30">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                ONLINE (READY)
              </span>
            </div>

            <div className="font-mono text-[12px] space-y-1.5 text-on-surface-variant pt-1 border-t border-outline-variant/40">
              <div className="flex justify-between">
                <span className="text-outline">IP Address:</span>
                <span className="text-on-surface font-medium">{local.ip || '127.0.0.1'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Capture Interface:</span>
                <span className="text-primary font-medium">{local.interface || 'Default (Synthetic)'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase 2: Agent Controls & Real ACK/RTT Testing Console ── */}
      <AgentControlPanel
        isConnected={isRemoteConnected}
        remoteDevice={remote}
        onRefresh={refreshDevices}
        onToast={showToast}
      />

      {/* ── Client Onboarding & Configuration Guide ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-outline text-[18px]">terminal</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface">
              {isRemoteConnected ? 'Connected Agent Configuration' : 'Connect Remote Agent (Computer A)'}
            </span>
          </div>
          <span className="font-mono text-[11px] text-outline">
            {isRemoteConnected ? 'Active Connection' : 'Setup Command'}
          </span>
        </div>

        <p className="text-[13px] text-on-surface-variant mb-3 leading-relaxed">
          {isRemoteConnected
            ? `Computer A is currently transmitting continuous heartbeats and system telemetry to Computer B on port ${tcpServer.port || 5000}.`
            : `To stream telemetry or launch attack packets from a second computer on your local network, run the client agent script on Computer A:`}
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg p-2.5 font-mono text-[12px]">
          <code className="text-primary truncate select-all">{clientCmd}</code>
          <button
            onClick={copyCommand}
            className="shrink-0 px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">
              {copiedCmd ? 'check' : 'content_copy'}
            </span>
            <span>{copiedCmd ? 'Copied' : 'Copy Command'}</span>
          </button>
        </div>
      </div>

      {/* ── Progressive Disclosure: Expandable Detailed Diagnostics ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">analytics</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Device Diagnostics &amp; Telemetry Internals
            </span>
          </div>

          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 text-primary hover:text-secondary font-mono text-[12px] font-medium transition-colors"
          >
            <span>{showDiagnostics ? 'Hide Raw Details' : 'Expand Raw Details'}</span>
            <span className="material-symbols-outlined text-[16px]">
              {showDiagnostics ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {showDiagnostics && (
          <div className="mt-3.5 pt-3.5 border-t border-outline-variant grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Computer A Raw Diagnostics */}
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/60 p-3.5 flex flex-col gap-2 font-mono text-[12px]">
              <div className="flex items-center justify-between text-outline border-b border-outline-variant/40 pb-2">
                <span className="font-semibold text-secondary uppercase tracking-wider">Agent Telemetry</span>
                <span className="text-[11px]">Protocol v1.0</span>
              </div>
              <div className="py-1 flex justify-between">
                <span className="text-outline">Heartbeat Sequence:</span>
                <span className="text-on-surface">{remote.heartbeat_seq != null ? `#${remote.heartbeat_seq}` : '—'}</span>
              </div>
              <div className="py-1 flex justify-between border-t border-outline-variant/30">
                <span className="text-outline">Last Heartbeat Time:</span>
                <span className="text-on-surface">{remote.last_heartbeat || '—'}</span>
              </div>
              <div className="py-1 flex justify-between border-t border-outline-variant/30">
                <span className="text-outline">Connected At:</span>
                <span className="text-on-surface-variant">{remote.connected_at || '—'}</span>
              </div>
            </div>

            {/* Computer B Raw Diagnostics */}
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/60 p-3.5 flex flex-col gap-2 font-mono text-[12px]">
              <div className="flex items-center justify-between text-outline border-b border-outline-variant/40 pb-2">
                <span className="font-semibold text-primary uppercase tracking-wider">NIDS Server Engine</span>
                <span className="text-[11px]">FastAPI + Scapy</span>
              </div>
              <div className="py-1 flex justify-between">
                <span className="text-outline">TCP Listener Status:</span>
                <span className="text-emerald-300 font-semibold">
                  {tcpServer.running ? `LISTENING (: ${tcpServer.port})` : 'STANDBY'}
                </span>
              </div>
              <div className="py-1 flex justify-between border-t border-outline-variant/30">
                <span className="text-outline">Packet Capture Engine:</span>
                <span className={status?.packet_capture?.running ? 'text-emerald-300' : 'text-outline'}>
                  {status?.packet_capture?.running ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div className="py-1 flex justify-between border-t border-outline-variant/30">
                <span className="text-outline">System Engine Uptime:</span>
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

/**
 * DevicesPage — Connected devices, agent status, and network topology.
 * Displays real telemetry from Computer A (Agent) and Computer B (Server).
 * Never fabricates connection states or fake latency.
 */
import { useState, useEffect } from 'react';
import { fetchDevices, fetchStatus } from '../api';
import { DisconnectedBanner } from './OverviewPage';

export default function DevicesPage({ backendConnected }) {
  const [devices, setDevices] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [d, s] = await Promise.all([fetchDevices(), fetchStatus()]);
        if (!active) return;
        setDevices(d);
        setStatus(s);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
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

  return (
    <div className="flex flex-col gap-3">
      {/* Topology Header Banner */}
      <div className="bg-surface-container-low border border-outline-variant rounded p-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Node 1: Computer A */}
          <div className={`flex-1 w-full p-3 rounded border transition-all ${
            isRemoteConnected
              ? 'bg-surface-container-high border-secondary/40 shadow-sm'
              : 'bg-surface-container-lowest border-outline-variant/60'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-secondary">computer</span>
                <div>
                  <div className="font-mono text-[10px] text-outline uppercase tracking-wider">COMPUTER A (AGENT)</div>
                  <div className="font-sans text-[13px] font-semibold text-on-surface">
                    {remote.hostname || (isRemoteConnected ? 'Remote Agent' : 'No Agent Connected')}
                  </div>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-semibold border ${
                isRemoteConnected
                  ? 'bg-secondary/15 text-secondary border-secondary/30'
                  : 'bg-surface-container text-outline border-outline-variant'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRemoteConnected ? 'bg-secondary' : 'bg-outline'}`} />
                {isRemoteConnected ? 'CONNECTED' : 'WAITING'}
              </span>
            </div>
            <div className="font-mono text-[11px] space-y-1 text-on-surface-variant">
              <div>IP: <span className="text-on-surface font-medium">{remote.ip ? `${remote.ip}:${remote.port}` : '—'}</span></div>
              <div>RTT: <span className="text-secondary font-medium">{remote.rtt_ms != null ? `${remote.rtt_ms} ms` : '—'}</span></div>
              <div>Heartbeat Seq: <span className="text-on-surface">{remote.heartbeat_seq ?? '—'}</span></div>
            </div>
          </div>

          {/* Connection Channel */}
          <div className="flex flex-col items-center justify-center px-2">
            <span className="font-mono text-[10px] text-outline uppercase tracking-wider mb-1">
              TCP Socket (Port {tcpServer.port || 5000})
            </span>
            <div className="flex items-center gap-1">
              <div className={`h-0.5 w-12 ${isRemoteConnected ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
              <span className={`material-symbols-outlined text-[18px] ${
                isRemoteConnected ? 'text-secondary' : 'text-outline'
              }`}>
                {isRemoteConnected ? 'sync_alt' : 'link_off'}
              </span>
              <div className={`h-0.5 w-12 ${isRemoteConnected ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
            </div>
            <span className="font-mono text-[10px] text-outline-variant mt-1">
              {isRemoteConnected ? '3s Heartbeat Loop' : 'Listening on 0.0.0.0'}
            </span>
          </div>

          {/* Node 2: Computer B */}
          <div className="flex-1 w-full p-3 rounded border bg-surface-container-high border-primary/40 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">dns</span>
                <div>
                  <div className="font-mono text-[10px] text-outline uppercase tracking-wider">COMPUTER B (SERVER / NIDS)</div>
                  <div className="font-sans text-[13px] font-semibold text-on-surface">
                    {local.hostname || 'Local Machine'}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-semibold border bg-primary/15 text-primary border-primary/30">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                ONLINE
              </span>
            </div>
            <div className="font-mono text-[11px] space-y-1 text-on-surface-variant">
              <div>IP: <span className="text-on-surface font-medium">{local.ip || '127.0.0.1'}</span></div>
              <div>Interface: <span className="text-on-surface font-medium">{local.interface || '—'}</span></div>
              <div>Server Port: <span className="text-primary font-medium">{tcpServer.port || 5000}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Instructions Card */}
      {!isRemoteConnected && (
        <div className="bg-surface-container-low border border-outline-variant rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-outline text-[18px]">terminal</span>
            <span className="font-mono text-[12px] font-semibold text-on-surface">
              Connect Remote Computer (Computer A)
            </span>
          </div>
          <p className="text-[12px] text-on-surface-variant mb-2">
            To connect Computer A as an agent and stream telemetry or run traffic simulations, run the client script on Computer A:
          </p>
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-2.5 font-mono text-[12px] text-primary select-all">
            python backend/networking/client.py --host {local.ip || '192.168.x.x'} --port {tcpServer.port || 5000}
          </div>
        </div>
      )}

      {/* Telemetry Detail Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Computer A Details */}
        <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
          <div className="h-8 px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">sensors</span>
              <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">
                COMPUTER A TELEMETRY
              </span>
            </div>
            <span className="font-mono text-[10px] text-outline">AGENT PROTOCOL v1.0</span>
          </div>
          <div className="p-3 divide-y divide-outline-variant/60 font-mono text-[12px]">
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Connection State</span>
              <span className={`font-semibold ${isRemoteConnected ? 'text-secondary' : 'text-outline'}`}>
                {isRemoteConnected ? 'ESTABLISHED' : 'NOT CONNECTED'}
              </span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Agent Hostname</span>
              <span className="text-on-surface">{remote.hostname || '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Remote Socket</span>
              <span className="text-on-surface">{remote.ip ? `${remote.ip}:${remote.port}` : '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Heartbeat Sequence</span>
              <span className="text-on-surface">{remote.heartbeat_seq != null ? `#${remote.heartbeat_seq}` : '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Measured Latency (RTT)</span>
              <span className="text-secondary font-semibold">{remote.rtt_ms != null ? `${remote.rtt_ms} ms` : '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Last Heartbeat</span>
              <span className="text-on-surface-variant">{remote.last_heartbeat || '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Connected At</span>
              <span className="text-on-surface-variant">{remote.connected_at || '—'}</span>
            </div>
          </div>
        </div>

        {/* Computer B Details */}
        <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
          <div className="h-8 px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">security</span>
              <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">
                COMPUTER B NIDS ENGINE
              </span>
            </div>
            <span className="font-mono text-[10px] text-outline">FASTAPI + TSHARK</span>
          </div>
          <div className="p-3 divide-y divide-outline-variant/60 font-mono text-[12px]">
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">TCP Server Status</span>
              <span className="text-emerald-300 font-semibold">
                {tcpServer.running ? `LISTENING (: ${tcpServer.port})` : 'STOPPED'}
              </span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Local Hostname</span>
              <span className="text-on-surface">{local.hostname || '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Local IP Address</span>
              <span className="text-on-surface">{local.ip || '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Active Interface</span>
              <span className="text-primary">{local.interface || '—'}</span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">Capture Status</span>
              <span className={status?.packet_capture?.running ? 'text-emerald-300' : 'text-outline'}>
                {status?.packet_capture?.running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">TShark Available</span>
              <span className={status?.packet_capture?.available ? 'text-emerald-300' : 'text-tertiary-fixed-dim'}>
                {status?.packet_capture?.available ? 'YES' : 'NO (CAPTURE UNAVAILABLE)'}
              </span>
            </div>
            <div className="py-1.5 flex justify-between">
              <span className="text-outline">System Uptime</span>
              <span className="text-on-surface-variant">
                {status?.uptime_seconds ? `${Math.floor(status.uptime_seconds)}s` : '0s'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

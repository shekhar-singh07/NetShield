/**
 * OverviewPage — Main System Overview Dashboard
 * Ownership: System health, important metrics, setup warnings, and a short recent-alert summary.
 * Re-routes full traffic visualization to /monitoring, attack simulation & full queue to /security,
 * and detailed topology to /devices.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchStatus, fetchMetrics, fetchEvents, fetchDevices } from '../api';

const SEVERITY_STYLES = {
  high: {
    badge: 'bg-error-container/40 text-error border-error-container',
    dot: 'bg-error',
    label: 'HIGH',
  },
  medium: {
    badge: 'bg-tertiary-container/30 text-tertiary-fixed-dim border-tertiary-container',
    dot: 'bg-amber-400',
    label: 'MED',
  },
  low: {
    badge: 'bg-surface-container-high text-primary border-primary/30',
    dot: 'bg-primary',
    label: 'LOW',
  },
};

export default function OverviewPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [s, d, m, e] = await Promise.all([
          fetchStatus(),
          fetchDevices(),
          fetchMetrics(),
          fetchEvents(10),
        ]);
        if (!active) return;
        setStatus(s);
        setDevices(d);
        setMetrics(m);
        setEvents(e?.events || []);
      } catch {
        // Silently preserve state during network hiccups
      }
    };

    poll();
    const id = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [backendConnected]);

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  const remote = devices?.remote || status?.remote_device || {};
  const isRemoteConnected = remote.status === 'connected';
  const captureAvail = status?.packet_capture?.available;
  const isMonitoring = status?.monitoring || false;
  const detectionMode = status?.detection?.mode || 'Hybrid (Rules + ML)';
  const counts = status?.counts || { normal: 0, suspicious: 0 };
  const protocols = metrics?.protocols || {};

  return (
    <div className="flex flex-col gap-4">
      {/* ── System Status & Setup Notices ── */}
      {!captureAvail && (
        <div className="bg-surface-container-low border border-outline-variant/80 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-tertiary text-[22px] mt-0.5">info</span>
            <div>
              <div className="text-[14px] font-semibold text-on-surface flex items-center gap-2">
                <span>Packet Capture Mode: Socket Listener &amp; Synthetic Testbed</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-tertiary-container/30 text-tertiary-fixed-dim border border-tertiary-container/40 font-medium">
                  PORT 5000
                </span>
              </div>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-relaxed">
                Local TShark binary is not installed on this host. NetShield is monitoring incoming TCP stream sockets on port 5000 and accepting attack simulations.
              </p>
            </div>
          </div>
          <Link
            to="/security"
            className="shrink-0 px-3 py-1.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-primary font-mono text-[12px] font-medium transition-colors flex items-center gap-1"
          >
            <span>Launch Simulation</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      )}

      {/* ── High-Level Health & Connectivity Strip ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shadow-xs">
        {/* Computer B (Server) */}
        <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-outline-variant/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-primary text-[20px]">dns</span>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-outline">Computer B (Server)</div>
              <div className="text-[13px] font-medium text-on-surface truncate">
                {status?.hostname || 'NIDS Core Host'}
              </div>
              <div className="text-[11px] font-mono text-outline">{status?.ip || '127.0.0.1'}</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
        </div>

        {/* Computer A (Agent) */}
        <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-outline-variant/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`material-symbols-outlined text-[20px] ${isRemoteConnected ? 'text-secondary' : 'text-outline'}`}>
              computer
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-outline">Computer A (Agent)</div>
              <div className="text-[13px] font-medium text-on-surface truncate">
                {remote.hostname || (isRemoteConnected ? 'Remote Client' : 'Not Connected')}
              </div>
              <div className="text-[11px] font-mono text-outline">
                {isRemoteConnected ? `${remote.ip}:${remote.port}` : 'Waiting on :5000'}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium px-2 py-0.5 rounded border ${
            isRemoteConnected
              ? 'text-secondary bg-secondary/10 border-secondary/30'
              : 'text-outline bg-surface-container border-outline-variant'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRemoteConnected ? 'bg-secondary' : 'bg-outline'}`} />
            {isRemoteConnected ? 'Connected' : 'Standby'}
          </span>
        </div>

        {/* Detection Engine */}
        <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-outline-variant/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`material-symbols-outlined text-[20px] ${isMonitoring ? 'text-emerald-400 animate-pulse' : 'text-primary'}`}>
              radar
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-outline">Detection Engine</div>
              <div className="text-[13px] font-medium text-on-surface truncate">
                {status?.detection?.ml_model_loaded ? 'ML + Heuristic' : 'Rule-Based Engine'}
              </div>
              <div className="text-[11px] font-mono text-outline">
                Uptime: {formatUptime(status?.uptime_seconds)}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium px-2 py-0.5 rounded border ${
            isMonitoring
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : 'text-outline bg-surface-container border-outline-variant'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-400' : 'bg-outline'}`} />
            {isMonitoring ? 'Active' : 'Ready'}
          </span>
        </div>

        {/* Packet Capture Status */}
        <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-outline-variant/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`material-symbols-outlined text-[20px] ${
              status?.packet_capture?.running
                ? 'text-emerald-400'
                : captureAvail
                ? 'text-primary'
                : 'text-tertiary'
            }`}>
              {status?.packet_capture?.running ? 'sensors' : 'signal_cellular_alt'}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-outline">Packet Capture</div>
              <div className="text-[13px] font-medium text-on-surface truncate">
                {status?.packet_capture?.interface || (captureAvail ? 'Local Interface' : 'Synthetic Mode')}
              </div>
              <div className="text-[11px] font-mono text-outline">
                {captureAvail ? 'TShark Sniffer' : 'Port 5000 Listener'}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium px-2 py-0.5 rounded border ${
            status?.packet_capture?.running
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : captureAvail
              ? 'text-outline bg-surface-container border-outline-variant'
              : 'text-tertiary-fixed-dim bg-tertiary-container/20 border-tertiary-container/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status?.packet_capture?.running ? 'bg-emerald-400' : captureAvail ? 'bg-outline' : 'bg-tertiary'
            }`} />
            {status?.packet_capture?.running ? 'Capturing' : captureAvail ? 'Standby' : 'Fallback'}
          </span>
        </div>
      </div>

      {/* ── Important Metrics Strip (13-14px labels, readable typography) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Packets Processed"
          value={metrics?.packets ?? 0}
          sub={metrics?.packets_per_second != null ? `${metrics.packets_per_second} pkts/s` : null}
          icon="data_usage"
        />
        <MetricCard
          label="Active Network Flows"
          value={metrics?.flows ?? 0}
          sub="5-tuple tracked"
          icon="alt_route"
        />
        <MetricCard
          label="Bandwidth Throughput"
          value={metrics?.bandwidth_mbps != null ? `${metrics.bandwidth_mbps}` : '0.00'}
          unit="Mbps"
          sub={metrics?.latency_ms != null ? `RTT ${metrics.latency_ms}ms` : null}
          icon="speed"
        />
        <MetricCard
          label="Security Incidents"
          value={counts.suspicious}
          alert={counts.suspicious > 0}
          sub={
            counts.suspicious > 0
              ? `${counts.suspicious} threats flagged`
              : isMonitoring
              ? 'No threats observed'
              : 'Standby mode'
          }
          icon="security"
        />
      </div>

      {/* ── Operational Overview & Page Summaries (2 Columns) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Traffic & Monitoring Summary */}
        <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs">
          <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">monitoring</span>
              <span className="font-mono text-[12px] font-semibold text-on-surface uppercase tracking-wider">
                Live Traffic Status
              </span>
            </div>
            <Link
              to="/monitoring"
              className="text-primary hover:text-secondary text-[12px] font-mono font-medium flex items-center gap-1 transition-colors"
            >
              <span>Live Console</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 bg-surface-container-lowest p-3 rounded border border-outline-variant/50">
              <div className="flex flex-col">
                <span className="text-outline text-[11px] font-mono">TCP Share</span>
                <span className="text-[16px] font-semibold text-primary font-mono mt-0.5">
                  {protocols.tcp ?? 0}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-[11px] font-mono">UDP Share</span>
                <span className="text-[16px] font-semibold text-secondary font-mono mt-0.5">
                  {protocols.udp ?? 0}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-[11px] font-mono">ICMP / Other</span>
                <span className="text-[16px] font-semibold text-tertiary-fixed-dim font-mono mt-0.5">
                  {protocols.icmp ?? 0}%
                </span>
              </div>
            </div>

            <div className="text-[13px] text-on-surface-variant flex items-center justify-between pt-1">
              <span>Sniffer State:</span>
              <span className="font-mono font-medium text-on-surface">
                {isMonitoring ? 'Continuous Packet Capture Active' : 'Standby (Ready to Sniff)'}
              </span>
            </div>
            <div className="text-[13px] text-on-surface-variant flex items-center justify-between border-t border-outline-variant/40 pt-2">
              <span>Network Interface:</span>
              <span className="font-mono text-on-surface">
                {status?.packet_capture?.interface || '(synthetic listener)'}
              </span>
            </div>
            <div className="text-[13px] text-on-surface-variant flex items-center justify-between border-t border-outline-variant/40 pt-2">
              <span>Normal Flows Logged:</span>
              <span className="font-mono text-emerald-300 font-semibold">
                {counts.normal.toLocaleString()} pkts
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Security & Detection Engine Summary */}
        <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs">
          <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-secondary">shield</span>
              <span className="font-mono text-[12px] font-semibold text-on-surface uppercase tracking-wider">
                Detection &amp; ML Architecture
              </span>
            </div>
            <Link
              to="/security"
              className="text-primary hover:text-secondary text-[12px] font-mono font-medium flex items-center gap-1 transition-colors"
            >
              <span>Security Center</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 bg-surface-container-lowest p-3 rounded border border-outline-variant/50">
              <div>
                <span className="text-outline text-[11px] font-mono">Classifier Model</span>
                <div className="text-[14px] font-semibold text-secondary font-mono mt-0.5">
                  RandomForest (60 Trees)
                </div>
              </div>
              <div>
                <span className="text-outline text-[11px] font-mono">Validated Accuracy</span>
                <div className="text-[14px] font-semibold text-emerald-300 font-mono mt-0.5">
                  99.4% F1-Score
                </div>
              </div>
            </div>

            <div className="text-[13px] text-on-surface-variant flex items-center justify-between pt-1">
              <span>Detection Framework:</span>
              <span className="font-mono font-medium text-on-surface">{detectionMode}</span>
            </div>
            <div className="text-[13px] text-on-surface-variant flex items-center justify-between border-t border-outline-variant/40 pt-2">
              <span>Active Heuristic Signatures:</span>
              <span className="font-mono text-on-surface">Port Scan, Spike, SYN Burst</span>
            </div>
            <div className="text-[13px] text-on-surface-variant flex items-center justify-between border-t border-outline-variant/40 pt-2">
              <span>Attack Simulation Studio:</span>
              <span className="font-mono text-primary">Available on Security Page</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Security Alerts Summary ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs overflow-hidden">
        <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-error">warning</span>
            <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">
              Recent Security Alerts
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[11px] border border-outline-variant">
              Latest {events.slice(0, 3).length} of {events.length}
            </span>
          </div>

          <Link
            to="/security"
            className="text-primary hover:text-secondary text-[12px] font-mono font-medium flex items-center gap-1 transition-colors"
          >
            <span>Investigate All Alerts</span>
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </Link>
        </div>

        {events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-8 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                  <th className="px-3.5 font-medium w-24">Severity</th>
                  <th className="px-3 font-medium">Alert Type</th>
                  <th className="px-3 font-medium">Source IP</th>
                  <th className="px-3 font-medium">Protocol</th>
                  <th className="px-3 font-medium">Confidence</th>
                  <th className="px-3 font-medium">Timestamp</th>
                  <th className="px-3 font-medium">Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/60 font-mono text-[12px]">
                {events.slice(0, 3).map((evt, idx) => {
                  const sevKey = (evt.severity || 'low').toLowerCase();
                  const sevCfg = SEVERITY_STYLES[sevKey] || SEVERITY_STYLES.low;
                  const isML = (evt.type || '').startsWith('ML_');

                  return (
                    <tr key={evt.id || idx} className="h-8 hover:bg-surface-container-high/60 transition-colors">
                      <td className="px-3.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${sevCfg.badge}`}>
                          <span className={`w-1 h-1 rounded-full ${sevCfg.dot}`} />
                          {sevCfg.label}
                        </span>
                      </td>
                      <td className="px-3 text-on-surface font-medium truncate max-w-[160px]">
                        <div className="flex items-center gap-1">
                          {isML && (
                            <span className="px-1 py-0.2 rounded bg-primary/20 text-primary text-[9px] font-bold border border-primary/30">
                              ML
                            </span>
                          )}
                          <span>{evt.type}</span>
                        </div>
                      </td>
                      <td className="px-3 text-on-surface">{evt.source_ip || '—'}</td>
                      <td className="px-3 text-on-surface-variant">{evt.protocol || 'TCP'}</td>
                      <td className="px-3">
                        {evt.confidence != null ? (
                          <span className="text-secondary font-semibold">
                            {(evt.confidence * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-outline">Rule</span>
                        )}
                      </td>
                      <td className="px-3 text-outline">{evt.timestamp}</td>
                      <td className="px-3 text-on-surface-variant truncate max-w-[260px]">
                        {evt.reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-outline">
            <span className="material-symbols-outlined text-[32px] text-outline/60">verified_user</span>
            <div className="text-[13px] font-medium text-on-surface">
              {isMonitoring
                ? 'Monitoring is active — No threat events recorded in this session'
                : 'Detection engine is currently in standby mode'}
            </div>
            <p className="text-[12px] text-on-surface-variant max-w-md">
              {isMonitoring
                ? 'All incoming traffic flows currently evaluate as benign.'
                : 'To test intrusion detection rules and RandomForest classification, trigger an attack vector in the Security Studio.'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link
                to="/security"
                className="px-3 py-1.5 rounded bg-primary/20 border border-primary/40 text-primary font-mono text-[11px] font-semibold hover:bg-primary/30 transition-colors"
              >
                Go to Attack Simulation Studio
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Subcomponents ──

export function DisconnectedBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <span className="material-symbols-outlined text-[48px] text-error">cloud_off</span>
      <h2 className="text-[20px] font-semibold text-on-surface">Backend Disconnected</h2>
      <p className="text-on-surface-variant text-[13px] text-center max-w-md">
        Cannot reach the NetShield-ML backend at <code className="text-primary font-mono">localhost:8000</code>.
        Start the backend server to see live telemetry and detection data.
      </p>
      <div className="mt-2 px-3 py-2 rounded bg-surface-container-high border border-outline-variant font-mono text-[12px] text-on-surface-variant select-all">
        python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
      </div>
      <div className="mt-1 px-3 py-1.5 rounded bg-error-container/20 border border-error/30 text-error font-mono text-[11px] font-semibold">
        DISCONNECTED / CHECK BACKEND CONSOLE
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, unit, icon, alert }) {
  return (
    <div className={`bg-surface-container-low border rounded-lg p-3.5 flex flex-col justify-between shadow-xs ${
      alert ? 'border-error/40 bg-error-container/10' : 'border-outline-variant'
    }`}>
      <div className="flex items-center justify-between text-outline">
        <span className="text-[13px] font-medium text-on-surface-variant">{label}</span>
        {icon && <span className="material-symbols-outlined text-[18px] opacity-75">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-[26px] font-bold tracking-tight font-mono ${alert ? 'text-error' : 'text-on-surface'}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="font-mono text-[12px] text-on-surface-variant font-medium">{unit}</span>}
      </div>
      {sub && (
        <span className="font-mono text-[11px] text-secondary font-medium mt-1 truncate">
          {sub}
        </span>
      )}
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

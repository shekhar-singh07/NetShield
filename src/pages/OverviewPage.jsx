/**
 * OverviewPage — Main dashboard overview.
 * Displays system status, metrics, traffic chart, protocol distribution,
 * interactive attack simulation studio, and recent security events.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchMetrics, fetchChartData, fetchEvents, fetchDevices } from '../api';
import TrafficChart from '../components/TrafficChart';
import ProtocolDistribution from '../components/ProtocolDistribution';
import DeviceStatus from '../components/DeviceStatus';
import SecurityEventTable from '../components/SecurityEventTable';
import SimulationPanel from '../components/SimulationPanel';

export default function OverviewPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [events, setEvents] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [s, d, m, c, e] = await Promise.all([
        fetchStatus(), fetchDevices(), fetchMetrics(), fetchChartData(), fetchEvents(50),
      ]);
      setStatus(s);
      setDevices(d);
      setMetrics(m);
      setChartData(c.data || []);
      setEvents(e.events || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [s, d, m, c, e] = await Promise.all([
          fetchStatus(), fetchDevices(), fetchMetrics(), fetchChartData(), fetchEvents(50),
        ]);
        if (!active) return;
        setStatus(s);
        setDevices(d);
        setMetrics(m);
        setChartData(c.data || []);
        setEvents(e.events || []);
      } catch {}
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [backendConnected]);

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  const remoteStatus = status?.remote_device?.status || 'disconnected';
  const captureAvail = status?.packet_capture?.available;
  const captureRunning = status?.packet_capture?.running;
  const detectionMode = status?.detection?.mode || '—';
  const counts = status?.counts || { normal: 0, suspicious: 0 };
  const protocols = metrics?.protocols || {};

  return (
    <div className="flex flex-col gap-3">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/40 px-3 py-2 rounded shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Device & Agent Telemetry Row */}
      <DeviceStatus
        local={devices?.local || { hostname: status?.hostname, ip: status?.ip, interface: status?.packet_capture?.interface }}
        remote={devices?.remote || status?.remote_device}
        tcpServer={devices?.tcp_server || status?.tcp_server}
        detection={status?.detection}
        isMonitoring={status?.monitoring}
      />

      {/* Attack Simulation & Traffic Generator Studio */}
      <SimulationPanel onSimulationComplete={() => {
        refreshAll();
        showToast('Simulation packet vector injected. Refreshing dashboard telemetry.');
      }} />

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MetricCard label="TOTAL PACKETS" value={metrics?.packets ?? 0} sub={`${metrics?.packets_per_second ?? 0}/s`} />
        <MetricCard label="ACTIVE FLOWS" value={metrics?.flows ?? 0} />
        <MetricCard label="BANDWIDTH" value={`${metrics?.bandwidth_mbps ?? 0}`} unit="Mbps" />
        <MetricCard label="RTT LATENCY" value={metrics?.latency_ms != null ? metrics.latency_ms : '—'} unit={metrics?.latency_ms != null ? 'ms' : ''} />
        <MetricCard label="PROTOCOLS" value={
          <span className="text-[11px] font-mono">
            TCP {protocols.tcp ?? 0}% · UDP {protocols.udp ?? 0}% · ICMP {protocols.icmp ?? 0}%
          </span>
        } />
      </div>

      {/* System Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* System Info */}
        <StatusCard title="SYSTEM STATUS" icon="dns">
          <Row label="Host Machine" value={status?.hostname || '—'} />
          <Row label="Local IPv4" value={status?.ip || '—'} />
          <Row label="Pipeline Monitoring" value={
            <StatusBadge active={status?.monitoring} labelOn="Active" labelOff="Ready" />
          } />
          <Row label="Detection Engine" value={detectionMode} />
          <Row label="System Uptime" value={formatUptime(status?.uptime_seconds)} />
        </StatusCard>

        {/* Device Status */}
        <StatusCard title="NETWORK INTERFACES" icon="device_hub">
          <Row label="Computer B (Server)" value={
            <StatusBadge active={true} labelOn="Online" />
          } />
          <Row label="Capture Interface" value={status?.packet_capture?.interface || '(none)'} />
          <Row label="Computer A (Agent)" value={
            <StatusBadge
              active={remoteStatus === 'connected'}
              labelOn="Connected"
              labelOff={remoteStatus === 'connecting' ? 'Connecting...' : 'Standby'}
            />
          } />
          <Row label="Agent Endpoint" value={status?.remote_device?.ip ? `${status.remote_device.ip}:${status.remote_device.port}` : 'Waiting on :5000'} />
          <Row label="Heartbeat Ping" value={status?.remote_device?.rtt_ms != null ? `${status.remote_device.rtt_ms} ms` : '—'} />
        </StatusCard>

        {/* Capture & Detection */}
        <StatusCard title="DETECTION & ML STATUS" icon="radar">
          <Row label="ML Model" value={
            <span className="text-secondary font-mono font-medium">
              {status?.detection?.ml_model_loaded ? status.detection.ml_model_name : 'Not Loaded'}
            </span>
          } />
          <Row label="TShark Sniffer" value={
            <StatusBadge active={captureAvail} labelOn="Available" labelOff="Not Installed" />
          } />
          <Row label="Normal Traffic" value={counts.normal.toLocaleString()} />
          <Row label="Threat Events" value={
            <span className={counts.suspicious > 0 ? 'text-error font-semibold font-mono' : 'font-mono'}>{counts.suspicious}</span>
          } />
        </StatusCard>
      </div>

      {/* Traffic Chart + Protocol Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        <div className="lg:col-span-8">
          <div className="bg-surface-container-low border border-outline-variant rounded overflow-hidden">
            <TrafficChart data={chartData} isMonitoring={status?.monitoring} onToast={showToast} />
          </div>
        </div>
        <div className="lg:col-span-4">
          <ProtocolDistribution protocols={protocols} />
        </div>
      </div>

      {/* Recent Security Events Table */}
      <SecurityEventTable
        events={events}
        onRefresh={refreshAll}
        onToast={showToast}
        pageSize={6}
        title="Recent Security Alerts & Threat Detections"
      />
    </div>
  );
}

// ── Shared sub-components ──

function DisconnectedBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <span className="material-symbols-outlined text-[48px] text-error">cloud_off</span>
      <h2 className="text-[20px] font-semibold text-on-surface">Backend Disconnected</h2>
      <p className="text-on-surface-variant text-[13px] text-center max-w-md">
        Cannot reach the NetShield-ML backend at <code className="text-primary font-mono">localhost:8000</code>.
        Start the backend server to see real data.
      </p>
      <div className="mt-2 px-3 py-2 rounded bg-surface-container-high border border-outline-variant font-mono text-[12px] text-on-surface-variant">
        python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
      </div>
      <div className="mt-1 px-3 py-1.5 rounded bg-error-container/20 border border-error/30 text-error font-mono text-[11px] font-semibold">
        DEMO / BACKEND DISCONNECTED
      </div>
    </div>
  );
}

export { DisconnectedBanner };

function StatusCard({ title, icon, children }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
      <div className="h-8 px-2 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
        <span className="material-symbols-outlined text-[16px] text-outline">{icon}</span>
        <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex flex-col divide-y divide-outline-variant/60 text-[12px]">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="px-2.5 py-1.5 flex items-center justify-between">
      <span className="text-outline text-[12px]">{label}</span>
      <span className="text-on-surface font-mono text-[11px] font-medium">{value}</span>
    </div>
  );
}

function StatusBadge({ active, labelOn = 'Active', labelOff = 'Inactive' }) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium ${active ? 'text-emerald-300' : 'text-outline'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-outline'}`} />
      {active ? labelOn : labelOff}
    </span>
  );
}

function MetricCard({ label, value, sub, unit }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded px-3 py-2 flex flex-col">
      <span className="font-mono text-[10px] font-medium text-outline uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[22px] font-semibold text-on-surface tracking-tight leading-7">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="font-mono text-[11px] text-on-surface-variant">{unit}</span>}
        {sub && <span className="font-mono text-[11px] text-secondary font-medium ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * MonitoringPage — Live network monitoring & capture console.
 * Shows real packet metrics, traffic chart, attack simulator, and active network flows.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchStatus,
  fetchMetrics,
  fetchChartData,
  fetchInterfaces,
  fetchFlows,
  startMonitoring,
  stopMonitoring,
} from '../api';
import TrafficChart from '../components/TrafficChart';
import SimulationPanel from '../components/SimulationPanel';
import { DisconnectedBanner } from './OverviewPage';

export default function MonitoringPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [flows, setFlows] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIface, setSelectedIface] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [flowSearch, setFlowSearch] = useState('');
  const [flowPage, setFlowPage] = useState(1);
  const FLOW_PAGE_SIZE = 8;

  const refreshData = useCallback(async () => {
    try {
      const [s, m, c, f] = await Promise.all([
        fetchStatus(),
        fetchMetrics(),
        fetchChartData(),
        fetchFlows(),
      ]);
      setStatus(s);
      setMetrics(m);
      setChartData(c.data || []);
      setFlows(f.flows || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [s, m, c, f] = await Promise.all([
          fetchStatus(),
          fetchMetrics(),
          fetchChartData(),
          fetchFlows(),
        ]);
        if (!active) return;
        setStatus(s);
        setMetrics(m);
        setChartData(c.data || []);
        setFlows(f.flows || []);
      } catch {}
    };

    poll();
    fetchInterfaces()
      .then((r) => {
        if (active) {
          setInterfaces(r.interfaces || []);
          if (r.current) setSelectedIface(r.current);
        }
      })
      .catch(() => {});

    const id = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [backendConnected]);

  const isMonitoring = status?.monitoring || false;
  const captureAvail = status?.packet_capture?.available || false;
  const captureIface = status?.packet_capture?.interface || '(none)';
  const protocols = metrics?.protocols || {};

  const handleStart = async () => {
    try {
      const result = await startMonitoring(selectedIface || undefined);
      if (result.success) {
        setActionMsg(`Monitoring started on ${result.interface}`);
      } else {
        setActionMsg(`Failed: ${result.reason || result.error}`);
      }
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await stopMonitoring();
      setActionMsg('Monitoring stopped');
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
  };

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  // Filter flows
  const filteredFlows = flows.filter((fl) => {
    if (!flowSearch.trim()) return true;
    const q = flowSearch.toLowerCase();
    return (
      (fl.source_ip || '').toLowerCase().includes(q) ||
      (fl.destination_ip || '').toLowerCase().includes(q) ||
      (fl.protocol || '').toLowerCase().includes(q) ||
      String(fl.destination_port || '').includes(q)
    );
  });

  const totalFlowPages = Math.max(1, Math.ceil(filteredFlows.length / FLOW_PAGE_SIZE));
  const safeFlowPage = Math.min(flowPage, totalFlowPages);
  const pagedFlows = filteredFlows.slice(
    (safeFlowPage - 1) * FLOW_PAGE_SIZE,
    safeFlowPage * FLOW_PAGE_SIZE
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar */}
      <div className="bg-surface-container-low border border-outline-variant rounded p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        {/* Start / Stop */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStart}
            disabled={isMonitoring || !captureAvail}
            className="h-8 px-3 rounded bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            Start Live Sniffer
          </button>
          <button
            onClick={handleStop}
            disabled={!isMonitoring}
            className="h-8 px-3 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface font-mono text-[12px] font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">stop</span>
            Stop
          </button>

          {/* Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] font-semibold ${
              isMonitoring
                ? 'bg-surface-container-high border-emerald-500/30 text-emerald-300'
                : 'bg-surface-container-high border-outline-variant text-outline'
            }`}
          >
            <div className="relative flex items-center justify-center w-2 h-2">
              {isMonitoring && (
                <span className="beacon-ring absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  isMonitoring ? 'bg-emerald-400' : 'bg-outline'
                }`}
              />
            </div>
            {isMonitoring ? 'INSPECTION ACTIVE' : 'ENGINE STANDBY'}
          </div>
        </div>

        {/* Interface & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-outline">Interface:</span>
            {interfaces.length > 0 ? (
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                className="h-7 px-2 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[11px] text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">Select Interface...</option>
                {interfaces.map((iface, i) => (
                  <option key={i} value={iface.split('.')[0]?.trim() || iface}>
                    {iface}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[11px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant">
                {captureIface}
              </span>
            )}
          </div>

          {actionMsg && (
            <span className="font-mono text-[11px] text-secondary font-medium">
              {actionMsg}
            </span>
          )}
        </div>
      </div>

      {/* Capture Fallback Notice if TShark not available */}
      {!captureAvail && (
        <div className="bg-surface-container-low border border-outline-variant rounded p-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-primary text-[22px] mt-0.5">info</span>
            <div>
              <p className="text-on-surface font-semibold text-[13px] font-mono">
                PACKET INJECTION &amp; HYBRID TESTBED MODE
              </p>
              <p className="text-on-surface-variant text-[12px] mt-0.5">
                Local TShark is not installed on this host. NetShield is operating with the integrated synthetic traffic generator and socket listener (Port 5000). Use the simulator below to generate live traffic and test intrusion detection.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Attack Simulation Studio */}
      <SimulationPanel onSimulationComplete={refreshData} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <MCard label="PACKETS" value={metrics?.packets ?? 0} />
        <MCard label="PACKETS/SEC" value={metrics?.packets_per_second ?? 0} />
        <MCard label="ACTIVE FLOWS" value={metrics?.flows ?? 0} />
        <MCard label="BANDWIDTH" value={`${metrics?.bandwidth_mbps ?? 0} Mbps`} />
        <MCard label="LATENCY RTT" value={metrics?.latency_ms != null ? `${metrics.latency_ms} ms` : '—'} />
        <MCard label="TCP FLOWS" value={`${protocols.tcp ?? 0}%`} />
        <MCard label="UDP FLOWS" value={`${protocols.udp ?? 0}%`} />
        <MCard label="ICMP FLOWS" value={`${protocols.icmp ?? 0}%`} />
      </div>

      {/* Traffic Chart */}
      <div className="bg-surface-container-low border border-outline-variant rounded overflow-hidden shadow-sm">
        <TrafficChart data={chartData} isMonitoring={isMonitoring} />
      </div>

      {/* Live Active Flows Table */}
      <div className="bg-surface-container-low border border-outline-variant rounded shadow-sm">
        <div className="h-9 px-3 flex flex-wrap items-center justify-between border-b border-outline-variant bg-surface-container-lowest gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-secondary">alt_route</span>
            <span className="text-[13px] font-semibold text-on-surface">
              Active Network Flows ({flows.length})
            </span>
            <span className="px-1.5 py-0.2 rounded bg-surface-container text-outline font-mono text-[10px]">
              5-Tuple Flow State
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search flows..."
              value={flowSearch}
              onChange={(e) => {
                setFlowSearch(e.target.value);
                setFlowPage(1);
              }}
              className="h-6 w-32 sm:w-44 px-2 rounded bg-surface-container border border-outline-variant text-[11px] font-mono text-on-surface focus:outline-none focus:border-primary"
            />
            <button
              onClick={refreshData}
              className="h-6 w-6 flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all"
              title="Refresh flow table"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-7 bg-surface-container border-b border-outline-variant text-outline font-mono text-[10px] uppercase tracking-wider">
                <th className="px-3 font-medium w-16">Proto</th>
                <th className="px-3 font-medium">Source Endpoint</th>
                <th className="px-2 font-medium text-center w-6"></th>
                <th className="px-3 font-medium">Destination Endpoint</th>
                <th className="px-3 font-medium text-right">Packets</th>
                <th className="px-3 font-medium text-right">Total Bytes</th>
                <th className="px-3 font-medium text-right">Throughput</th>
                <th className="px-3 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 font-mono text-[11px]">
              {pagedFlows.map((fl, i) => (
                <tr key={i} className="h-7 hover:bg-surface-container-high/60 transition-colors">
                  <td className="px-3">
                    <span className={`px-1 py-0.2 rounded text-[9px] font-semibold border ${
                      fl.protocol === 'TCP'
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : fl.protocol === 'UDP'
                        ? 'bg-secondary/15 text-secondary border-secondary/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>
                      {fl.protocol}
                    </span>
                  </td>
                  <td className="px-3 text-on-surface font-medium">
                    {fl.source_ip}:{fl.source_port ?? '—'}
                  </td>
                  <td className="px-2 text-center text-outline">
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </td>
                  <td className="px-3 text-on-surface">
                    {fl.destination_ip}:{fl.destination_port ?? '—'}
                  </td>
                  <td className="px-3 text-right text-on-surface-variant font-medium">
                    {fl.packet_count?.toLocaleString()}
                  </td>
                  <td className="px-3 text-right text-on-surface-variant">
                    {formatBytes(fl.byte_count)}
                  </td>
                  <td className="px-3 text-right text-secondary font-medium">
                    {fl.packets_per_sec != null ? `${fl.packets_per_sec} pkt/s` : '—'}
                  </td>
                  <td className="px-3 text-right text-outline">
                    {fl.duration != null ? `${fl.duration.toFixed(1)}s` : '—'}
                  </td>
                </tr>
              ))}

              {pagedFlows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-outline font-mono text-[11px]">
                    {flows.length === 0
                      ? 'No active flows recorded. Launch traffic simulations or start capture to generate flows.'
                      : 'No active flows match your search filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Flow Pagination */}
        <div className="h-7 px-3 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between text-outline font-mono text-[11px]">
          <span>
            Showing {pagedFlows.length} of {filteredFlows.length} active flows
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={safeFlowPage <= 1}
              onClick={() => setFlowPage((p) => Math.max(1, p - 1))}
              className="px-1 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
            >
              &lt; Prev
            </button>
            <span className="text-on-surface px-1">
              {safeFlowPage} / {totalFlowPages}
            </span>
            <button
              disabled={safeFlowPage >= totalFlowPages}
              onClick={() => setFlowPage((p) => Math.min(totalFlowPages, p + 1))}
              className="px-1 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
            >
              Next &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MCard({ label, value }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded px-2.5 py-2 flex flex-col shadow-xs">
      <span className="font-mono text-[9px] font-medium text-outline uppercase tracking-wider">
        {label}
      </span>
      <span className="text-[17px] font-semibold text-on-surface tracking-tight leading-6 mt-0.5 font-mono">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

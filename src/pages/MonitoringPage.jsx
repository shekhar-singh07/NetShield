/**
 * MonitoringPage — live capture controls, traffic metrics, charts, flows.
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
import ProtocolDistribution from '../components/ProtocolDistribution';
import { DisconnectedBanner } from './OverviewPage';

const FLOW_PAGE_SIZE = 10;

export default function MonitoringPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [flows, setFlows] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIface, setSelectedIface] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [flowSearch, setFlowSearch] = useState('');
  const [flowPage, setFlowPage] = useState(1);

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
      setChartData(c?.data || []);
      setFlows(f?.flows || []);
    } catch {
      // Silently catch errors
    }
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
        setChartData(c?.data || []);
        setFlows(f?.flows || []);
      } catch {
        // Polling failover
      }
    };

    poll();
    fetchInterfaces()
      .then((r) => {
        if (active) {
          setInterfaces(r?.interfaces || []);
          if (r?.current) setSelectedIface(r.current);
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
  const captureRunning = status?.packet_capture?.running || false;
  const captureIface = status?.packet_capture?.interface || '(none)';
  const protocols = metrics?.protocols || {};
  const actionIsError = actionMsg.startsWith('Failed') || actionMsg.startsWith('Error');

  let banner;
  if (captureRunning) {
    banner = {
      tone: 'bg-secondary/10 border-secondary/30 text-secondary',
      icon: 'check_circle',
      text: `Live capture · ${captureIface !== '(none)' ? captureIface : 'TShark'}`,
      next: 'Next: watch charts and flows below.',
    };
  } else if (!captureAvail) {
    banner = {
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: 'signal_cellular_alt',
      text: 'Synthetic mode · TShark not installed.',
      next: 'Next: install Wireshark, or run simulations.',
    };
  } else {
    banner = {
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: 'hourglass_top',
      text: 'Capture stopped.',
      next: 'Next: press Start Live Sniffer.',
    };
  }

  const handleStart = async () => {
    setActionLoading(true);
    setActionMsg('');
    try {
      const result = await startMonitoring(selectedIface || undefined);
      if (result.success) {
        setActionMsg(`Monitoring started on ${result.interface}`);
        refreshData();
      } else {
        setActionMsg(`Failed to start: ${result.reason || result.error}`);
      }
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setActionMsg('');
    try {
      await stopMonitoring();
      setActionMsg('Packet capture stopped');
      refreshData();
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setActionLoading(false);
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
    <div className="flex flex-col gap-4">
      {/* ── Status banner ── */}
      <div className={`flex items-start gap-2.5 rounded-lg border p-3.5 ${banner.tone}`}>
        <span className="material-symbols-outlined text-[20px] leading-none">{banner.icon}</span>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] font-semibold">{banner.text}</span>
          <span className="font-mono text-[12px] opacity-90">{banner.next}</span>
        </div>
      </div>

      {/* ── Packet Capture Controls Bar ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleStart}
            disabled={captureRunning || !captureAvail || actionLoading}
            className="h-9 px-4 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 font-mono text-[13px] font-semibold transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>{actionLoading ? 'Starting...' : 'Start Live Sniffer'}</span>
          </button>

          <button
            onClick={handleStop}
            disabled={!isMonitoring || actionLoading}
            className="h-9 px-4 rounded-lg bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface font-mono text-[13px] font-medium transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">stop</span>
            <span>Stop Capture</span>
          </button>
        </div>

        {/* Interface & Feedback */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-outline">Interface:</span>
            {interfaces.length > 0 ? (
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">Auto-detect</option>
                {interfaces.map((iface, i) => (
                  <option key={i} value={iface.split('.')[0]?.trim() || iface}>
                    {iface}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[12px] text-on-surface-variant bg-surface-container px-2.5 py-1 rounded border border-outline-variant">
                {captureIface}
              </span>
            )}
          </div>

          {actionMsg && (
            <span
              className={`font-mono text-[12px] font-medium bg-surface-container px-2.5 py-1 rounded border ${
                actionIsError
                  ? 'text-error border-error/30'
                  : 'text-secondary border-secondary/30'
              }`}
            >
              {actionMsg}
            </span>
          )}
        </div>
      </div>

      {/* ── Key Network Metrics Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MCard
          label="Total Packets"
          value={metrics?.packets ?? 0}
          sub={metrics?.packets_per_second != null ? `${metrics.packets_per_second} pkts/sec` : null}
        />
        <MCard
          label="Active Flows"
          value={metrics?.flows ?? 0}
          sub="Tracked 5-tuples"
        />
        <MCard
          label="Throughput"
          value={metrics?.bandwidth_mbps != null ? `${metrics.bandwidth_mbps} Mbps` : '0 Mbps'}
        />
        <MCard
          label="Round-Trip RTT"
          value={metrics?.latency_ms != null ? `${metrics.latency_ms} ms` : '—'}
          sub="Agent heartbeat delay"
        />
      </div>

      {/* ── Live Traffic Visualization (TrafficChart + ProtocolDistribution) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8 bg-surface-container-low border border-outline-variant rounded-lg overflow-hidden shadow-xs">
          <TrafficChart data={chartData} isMonitoring={captureRunning} />
        </div>
        <div className="lg:col-span-4">
          <ProtocolDistribution protocols={protocols} />
        </div>
      </div>

      {/* ── Active Network Flows Table ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="h-10 px-3.5 flex flex-wrap items-center justify-between border-b border-outline-variant bg-surface-container-lowest gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">alt_route</span>
            <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">
              Active Network Flows ({flows.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search IP, port, proto..."
              value={flowSearch}
              onChange={(e) => {
                setFlowSearch(e.target.value);
                setFlowPage(1);
              }}
              className="h-7 w-36 sm:w-48 px-2.5 rounded bg-surface-container border border-outline-variant text-[12px] font-mono text-on-surface focus:outline-none focus:border-primary"
            />
            <button
              onClick={refreshData}
              className="h-7 w-7 flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all rounded hover:bg-surface-container"
              title="Refresh flow table"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-8 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                <th className="px-3.5 font-medium w-20">Protocol</th>
                <th className="px-3.5 font-medium">Source Endpoint</th>
                <th className="px-2 font-medium text-center w-6"></th>
                <th className="px-3.5 font-medium">Destination Endpoint</th>
                <th className="px-3.5 font-medium text-right">Packets</th>
                <th className="px-3.5 font-medium text-right">Total Bytes</th>
                <th className="px-3.5 font-medium text-right">Rate</th>
                <th className="px-3.5 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 font-mono text-[12px]">
              {pagedFlows.map((fl, i) => (
                <tr key={i} className="h-8 hover:bg-surface-container-high/60 transition-colors">
                  <td className="px-3.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        fl.protocol === 'TCP'
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : fl.protocol === 'UDP'
                          ? 'bg-secondary/15 text-secondary border-secondary/30'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {fl.protocol}
                    </span>
                  </td>
                  <td className="px-3.5 text-on-surface font-medium">
                    {fl.source_ip}:{fl.source_port ?? '—'}
                  </td>
                  <td className="px-2 text-center text-outline">
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </td>
                  <td className="px-3.5 text-on-surface">
                    {fl.destination_ip}:{fl.destination_port ?? '—'}
                  </td>
                  <td className="px-3.5 text-right text-on-surface-variant font-medium">
                    {fl.packet_count?.toLocaleString()}
                  </td>
                  <td className="px-3.5 text-right text-on-surface-variant">
                    {formatBytes(fl.byte_count)}
                  </td>
                  <td className="px-3.5 text-right text-secondary font-medium">
                    {fl.packets_per_sec != null ? `${fl.packets_per_sec} pkt/s` : '—'}
                  </td>
                  <td className="px-3.5 text-right text-outline">
                    {fl.duration != null ? `${fl.duration.toFixed(1)}s` : '—'}
                  </td>
                </tr>
              ))}

              {pagedFlows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-outline font-mono text-[12px]">
                    {flows.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="material-symbols-outlined text-[28px] text-outline/60">waves</span>
                        <span>No active flows.</span>
                        <span className="text-[11px] text-on-surface-variant">
                          {isMonitoring
                            ? 'Waiting for packets…'
                            : 'Start capture or run a simulation.'}
                        </span>
                      </div>
                    ) : (
                      'No flows match your search filter.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="h-8 px-3.5 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between text-outline font-mono text-[11px]">
          <span>
            Showing {pagedFlows.length} of {filteredFlows.length} active flows
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={safeFlowPage <= 1}
              onClick={() => setFlowPage((p) => Math.max(1, p - 1))}
              className="px-2 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
            >
              &lt; Prev
            </button>
            <span className="text-on-surface px-1">
              {safeFlowPage} / {totalFlowPages}
            </span>
            <button
              disabled={safeFlowPage >= totalFlowPages}
              onClick={() => setFlowPage((p) => Math.min(totalFlowPages, p + 1))}
              className="px-2 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
            >
              Next &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MCard({ label, value, sub }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3 flex flex-col justify-between shadow-xs">
      <span className="text-[12px] font-medium text-on-surface-variant">{label}</span>
      <span className="text-[22px] font-bold text-on-surface tracking-tight mt-1.5 font-mono">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span className="font-mono text-[11px] text-secondary font-medium mt-1 truncate">{sub}</span>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

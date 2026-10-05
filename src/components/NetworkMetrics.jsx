/**
 * NetworkMetrics — stats bar below the traffic chart showing
 *                  Packets, Sessions, Bandwidth, and RTT.
 */
export default function NetworkMetrics({ metrics, isMonitoring }) {
  const rate = isMonitoring ? `+${metrics.packetRate}/s` : '—';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border-t border-outline-variant bg-surface-container-high/40">
      {/* Packets Processed */}
      <div className="px-2 py-1.5 border-r border-b md:border-b-0 border-outline-variant flex flex-col justify-center">
        <span className="font-mono text-[11px] font-medium text-outline uppercase tracking-wider">PACKETS PROCESSED</span>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-[24px] font-semibold text-on-surface tracking-tight leading-7 transition-all duration-300">
            {metrics.packets.toLocaleString()}
          </span>
          <span className="font-mono text-[11px] text-secondary font-medium transition-colors duration-200">
            {rate}
          </span>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="px-2 py-1.5 border-r border-b md:border-b-0 border-outline-variant flex flex-col justify-center">
        <span className="font-mono text-[11px] font-medium text-outline uppercase tracking-wider">ACTIVE SESSIONS</span>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-[24px] font-semibold text-on-surface tracking-tight leading-7">
            {metrics.sessions.toLocaleString()}
          </span>
          <span className="font-mono text-[11px] text-outline">Flows (TCP/UDP)</span>
        </div>
      </div>

      {/* Aggregated Bandwidth */}
      <div className="px-2 py-1.5 border-r border-outline-variant flex flex-col justify-center">
        <span className="font-mono text-[11px] font-medium text-outline uppercase tracking-wider">AGGREGATED BANDWIDTH</span>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-[24px] font-semibold text-on-surface tracking-tight leading-7">
            {metrics.bandwidth.toFixed(1)}
          </span>
          <span className="font-mono text-[12px] text-on-surface font-normal">MB/s</span>
        </div>
      </div>

      {/* Avg RTT */}
      <div className="px-2 py-1.5 flex flex-col justify-center">
        <span className="font-mono text-[11px] font-medium text-outline uppercase tracking-wider">AVG ROUND-TRIP TIME</span>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-[24px] font-semibold text-on-surface tracking-tight leading-7">
            {metrics.rtt}
          </span>
          <span className="font-mono text-[12px] text-on-surface font-normal">ms RTT</span>
        </div>
      </div>
    </div>
  );
}

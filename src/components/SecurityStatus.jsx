import { useState, useEffect } from 'react';

/**
 * SecurityStatus — System Status & ML Inference panel
 *                  showing engine status, model info, latency, and resource utilization.
 */
export default function SecurityStatus({ stats, isMonitoring }) {
  const [uptime, setUptime] = useState(4 * 3600 + 21 * 36); // demo starting uptime in seconds

  // Tick uptime every second
  useEffect(() => {
    const id = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtUptime = () => {
    const h = String(Math.floor(uptime / 3600)).padStart(2, '0');
    const m = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
    const s = String(uptime % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
      {/* Header */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <span className="text-[13px] font-semibold text-on-surface flex items-center gap-1.5 leading-[18px]">
          <span className="material-symbols-outlined text-[16px] text-outline">memory</span>
          System Status &amp; ML Inference
        </span>
        <span className="font-mono text-[10px] text-emerald-400 font-semibold tracking-wider">
          LOAD: OPTIMAL
        </span>
      </div>

      {/* Rows */}
      <div className="flex flex-col divide-y divide-outline-variant/60 text-[12px]">
        {/* Engine Status */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Engine Status</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-on-surface font-mono text-[11px] font-medium">
              {isMonitoring ? 'Monitoring Active' : 'Daemon Paused'}
            </span>
          </div>
        </div>

        {/* Model In-Memory */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Model In-Memory</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-on-surface font-semibold">RandomForest-NIDS</span>
            <span className="text-outline">(v1.8)</span>
          </div>
        </div>

        {/* Inference Latency */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Inference Latency</span>
          <span className="font-mono text-[11px] text-secondary font-medium">
            {(4.0 + Math.random() * 0.5).toFixed(1)} ms / sample
          </span>
        </div>

        {/* Packet Inspection */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Packet Inspection</span>
          <span className="text-on-surface font-mono text-[11px]">Real-time DPDK (L3/L4)</span>
        </div>

        {/* Daemon Uptime */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Daemon Uptime</span>
          <span className="font-mono text-[11px] text-on-surface">{fmtUptime()}</span>
        </div>

        {/* Core Utilization */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-outline">Core Utilization</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-on-surface">CPU {12 + Math.floor(Math.random() * 5)}%</span>
            <span className="text-outline-variant">|</span>
            <span className="text-on-surface">RAM 1.8 / 8.0 GB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

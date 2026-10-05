import { useState } from 'react';
import { simulateTraffic } from '../api';

const SCENARIOS = [
  {
    id: 'port_scan',
    label: 'Port Scan Recon',
    icon: 'travel_explore',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
    desc: 'Probes 25 unique TCP ports to trigger PORT_SCAN_LIKE and ML_PORT_SCAN rules.',
    badge: 'RECON',
  },
  {
    id: 'traffic_spike',
    label: 'Traffic Spike (DDoS)',
    icon: 'bolt',
    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20',
    desc: 'Bursts 550+ high-bandwidth packets in under 1s to trigger TRAFFIC_SPIKE rules.',
    badge: 'VOLUMETRIC',
  },
  {
    id: 'connection_burst',
    label: 'SYN Connection Burst',
    icon: 'hub',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20',
    desc: 'Initiates 60 rapid TCP SYN connection requests to trigger CONNECTION_BURST.',
    badge: 'EXPLOIT',
  },
  {
    id: 'normal',
    label: 'Normal Traffic Mix',
    icon: 'check_circle',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
    desc: 'Generates standard benign multi-protocol traffic (HTTP, HTTPS, DNS, NTP).',
    badge: 'BENIGN',
  },
];

export default function SimulationPanel({ onSimulationComplete }) {
  const [loadingScenario, setLoadingScenario] = useState(null);
  const [sourceIp, setSourceIp] = useState('192.168.1.105');
  const [lastResult, setLastResult] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleLaunch = async (scenarioId) => {
    setLoadingScenario(scenarioId);
    setLastResult(null);
    try {
      const res = await simulateTraffic(scenarioId, 50, sourceIp);
      setLastResult(res);
      onSimulationComplete?.(res);
    } catch (err) {
      setLastResult({ error: err.message });
    } finally {
      setLoadingScenario(null);
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col shadow-sm overflow-hidden">
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
          <span className="font-mono text-[12px] font-semibold text-on-surface uppercase tracking-wider">
            Attack Simulation &amp; Traffic Generator Studio
          </span>
          <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px] font-semibold border border-primary/30">
            PHASE 2 &amp; 3 TESTBED
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-outline hover:text-on-surface text-[12px] font-mono flex items-center gap-0.5"
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            <span className="material-symbols-outlined text-[16px]">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 flex flex-col gap-3">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container/60 p-2 rounded border border-outline-variant/60">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-outline">Simulated Source IP:</span>
              <input
                type="text"
                value={sourceIp}
                onChange={(e) => setSourceIp(e.target.value)}
                className="w-32 px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[11px] text-on-surface focus:outline-none focus:border-primary"
                placeholder="192.168.1.105"
              />
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Injects synthetic packet vectors directly through <span className="text-primary font-mono">FlowAnalyzer</span> and <span className="text-secondary font-mono">RandomForest ML</span>.
            </p>
          </div>

          {/* Scenario Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {SCENARIOS.map((s) => {
              const isLoading = loadingScenario === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleLaunch(s.id)}
                  disabled={loadingScenario !== null}
                  className={`p-2.5 rounded border text-left flex flex-col justify-between transition-all duration-150 ${s.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                        <span className="font-mono text-[12px] font-semibold">{s.label}</span>
                      </div>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded border uppercase font-bold opacity-80">
                        {s.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-tight">
                      {s.desc}
                    </p>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px] font-mono font-medium">
                    <span>{isLoading ? 'Injecting Packets...' : 'Execute Simulation'}</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {isLoading ? 'hourglass_top' : 'play_arrow'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Feedback banner */}
          {lastResult && (
            <div className={`p-2 rounded border font-mono text-[11px] flex items-center justify-between ${
              lastResult.error
                ? 'bg-error-container/20 border-error/40 text-error'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">
                  {lastResult.error ? 'error' : 'task_alt'}
                </span>
                <span>
                  {lastResult.error
                    ? `Simulation failed: ${lastResult.error}`
                    : `Scenario "${lastResult.scenario}" executed — Injected ${lastResult.packets_generated} packets from ${lastResult.source_ip}. Detection rules & ML model evaluated.`}
                </span>
              </div>
              <button
                onClick={() => setLastResult(null)}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

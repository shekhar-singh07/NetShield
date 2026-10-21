import { useState } from 'react';
import { simulateTraffic } from '../api';

const SCENARIOS = [
  {
    id: 'port_scan',
    label: 'Port Scan',
    icon: 'travel_explore',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    btn: 'border-amber-500/40 hover:bg-amber-500/20',
    severity: 'HIGH',
  },
  {
    id: 'traffic_spike',
    label: 'Traffic Spike',
    icon: 'bolt',
    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    btn: 'border-rose-500/40 hover:bg-rose-500/20',
    severity: 'HIGH',
  },
  {
    id: 'connection_burst',
    label: 'SYN Burst',
    icon: 'hub',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    btn: 'border-purple-500/40 hover:bg-purple-500/20',
    severity: 'MEDIUM',
  },
  {
    id: 'normal',
    label: 'Normal Mix',
    icon: 'check_circle',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    btn: 'border-emerald-500/40 hover:bg-emerald-500/20',
    severity: 'BENIGN',
  },
];

const SEVERITY_TAG = {
  HIGH: 'bg-error-container/40 text-error border-error-container',
  MEDIUM: 'bg-tertiary-container/30 text-tertiary-fixed-dim border-tertiary-container',
  BENIGN: 'bg-secondary/15 text-secondary border-secondary/30',
};

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
    <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs overflow-hidden">
      {/* Header */}
      <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">smart_toy</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Simulations
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-outline hover:text-on-surface text-[12px] font-mono flex items-center gap-1 transition-colors"
        >
          <span>{isExpanded ? 'Hide' : 'Show'}</span>
          <span className="material-symbols-outlined text-[16px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="p-3.5 flex flex-col gap-3.5">
          {/* Source IP */}
          <div className="flex flex-wrap items-center gap-2.5 bg-surface-container/60 p-2.5 rounded-lg border border-outline-variant/60">
            <span className="font-mono text-[12px] text-outline">Source IP</span>
            <input
              type="text"
              value={sourceIp}
              onChange={(e) => setSourceIp(e.target.value)}
              className="w-36 h-7.5 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
              placeholder="192.168.1.105"
            />
          </div>

          {/* Scenario Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SCENARIOS.map((s) => {
              const isLoading = loadingScenario === s.id;
              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg border flex flex-col gap-2.5 ${s.color}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] shrink-0">{s.icon}</span>
                      <span className="font-mono text-[13px] font-semibold truncate text-inherit">
                        {s.label}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold shrink-0 ${SEVERITY_TAG[s.severity]}`}
                    >
                      {s.severity}
                    </span>
                  </div>

                  <button
                    onClick={() => handleLaunch(s.id)}
                    disabled={loadingScenario !== null}
                    className={`w-full h-8 rounded-lg border font-mono text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all ${s.btn} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isLoading ? 'hourglass_top' : 'play_arrow'}
                    </span>
                    <span>{isLoading ? 'Running...' : 'Run'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Result */}
          {lastResult && (
            <div
              className={`p-2.5 rounded-lg border font-mono text-[12px] flex items-center justify-between ${
                lastResult.error
                  ? 'bg-error-container/20 border-error/40 text-error'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px]">
                  {lastResult.error ? 'error' : 'task_alt'}
                </span>
                <span>
                  {lastResult.error
                    ? `Failed: ${lastResult.error}`
                    : `${lastResult.scenario} · ${lastResult.packets_generated} packets simulated`}
                </span>
              </div>
              <button
                onClick={() => setLastResult(null)}
                className="text-outline hover:text-on-surface p-0.5"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

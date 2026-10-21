/**
 * SecurityPage — simulations, custom lab, ML diagnostics, event queue.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchEvents, fetchModelInfo } from '../api';
import { DisconnectedBanner } from './OverviewPage';
import SecurityEventTable from '../components/SecurityEventTable';
import SimulationPanel from '../components/SimulationPanel';
import CustomTrafficLab from '../components/CustomTrafficLab';

const eventKey = (e) => `${e.timestamp}|${e.type}|${e.source_ip}`;

export default function SecurityPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [eventsData, setEventsData] = useState({ events: [], total: 0 });
  const [modelInfo, setModelInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [simulatedKeys, setSimulatedKeys] = useState(() => new Set());

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [s, e, m] = await Promise.all([
        fetchStatus(),
        fetchEvents(200),
        fetchModelInfo(),
      ]);
      setStatus(s);
      setEventsData(e || { events: [], total: 0 });
      setModelInfo(m);
    } catch {
      // Backend error failover
    }
  }, []);

  const markSimulated = useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setSimulatedKeys((prev) => {
      const next = new Set(prev);
      list.forEach((e) => next.add(eventKey(e)));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [s, e, m] = await Promise.all([
          fetchStatus(),
          fetchEvents(200),
          fetchModelInfo(),
        ]);
        if (!active) return;
        setStatus(s);
        setEventsData(e || { events: [], total: 0 });
        setModelInfo(m);
      } catch {
        // Silently preserve state
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

  const detection = status?.detection || {};
  const isEngineRunning = detection.running ?? true;
  const counts = status?.counts || { normal: 0, suspicious: 0 };
  const allEvents = eventsData.events || [];
  const importances = modelInfo?.feature_importances || {};
  const rules = detection.rules || [];
  const modelName = modelInfo?.name || detection.ml_model_name || 'RandomForest-NIDS';
  const accuracy =
    modelInfo?.accuracy != null ? `${(modelInfo.accuracy * 100).toFixed(0)}%` : null;

  let banner;
  if (!isEngineRunning) {
    banner = {
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: 'hourglass_top',
      text: 'Detection engine on standby.',
      next: 'Next: run a simulation below.',
    };
  } else if (counts.suspicious > 0) {
    banner = {
      tone: 'bg-error-container/20 border-error/40 text-error',
      icon: 'warning',
      text: `${counts.suspicious} alert${counts.suspicious === 1 ? '' : 's'} recorded`,
      next: 'Next: open Details on an alert.',
    };
  } else {
    banner = {
      tone: 'bg-secondary/10 border-secondary/30 text-secondary',
      icon: 'check_circle',
      text: 'Detection running · no threats',
      next: 'Next: run a simulation below.',
    };
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toast Notification ── */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/50 px-3.5 py-2.5 rounded-lg shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Status banner ── */}
      <div className={`flex items-start gap-2.5 rounded-lg border p-3.5 ${banner.tone}`}>
        <span className="material-symbols-outlined text-[20px] leading-none">{banner.icon}</span>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] font-semibold">{banner.text}</span>
          <span className="font-mono text-[12px] opacity-90">{banner.next}</span>
        </div>
      </div>

      {/* ── Simulations ── */}
      <SimulationPanel
        onSimulationComplete={(res) => {
          markSimulated(res?.recent_events);
          refreshAll();
          showToast('Simulation done. Check alerts below.');
        }}
      />

      {/* ── Custom lab ── */}
      <CustomTrafficLab
        onTestComplete={(res) => {
          markSimulated(res?.events_triggered);
          refreshAll();
        }}
        onToast={showToast}
      />

      {/* ── ML Diagnostics (collapsed by default) ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px]">psychology</span>
              <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
                ML Diagnostics
              </span>
            </span>
            <span className="font-mono text-[12px] text-on-surface-variant">{modelName}</span>
          </div>

          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 text-primary hover:text-secondary font-mono text-[12px] font-medium transition-colors"
          >
            <span>{showDiagnostics ? 'Hide' : 'Show'}</span>
            <span className="material-symbols-outlined text-[16px]">
              {showDiagnostics ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {showDiagnostics && (
          <div className="mt-3.5 pt-3.5 border-t border-outline-variant grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* Feature importances */}
            <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/60 flex flex-col gap-3">
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Engine</span>
                <span className={isEngineRunning ? 'text-emerald-300' : 'text-outline'}>
                  {isEngineRunning ? 'Running' : 'Standby'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Mode</span>
                <span className="text-on-surface">{detection.mode || 'Hybrid (Rules + ML)'}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Classes</span>
                <span className="text-secondary text-right">
                  {(modelInfo?.classes || []).join(', ') || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Trees</span>
                <span className="text-on-surface">{modelInfo?.estimators ?? '—'}</span>
              </div>

              <div className="flex flex-col gap-2 mt-1">
                <span className="font-mono text-[11px] uppercase text-outline font-semibold">
                  Feature importances
                </span>
                {Object.entries(importances).length > 0 ? (
                  Object.entries(importances).map(([fname, weight]) => (
                    <div key={fname} className="flex flex-col gap-0.5">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-on-surface-variant">{fname}</span>
                        <span className="text-secondary font-medium">{(weight * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className="h-full bg-secondary transition-all duration-300"
                          style={{ width: `${Math.min(weight * 250, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] font-mono text-outline">—</div>
                )}
              </div>
            </div>

            {/* Signature rules */}
            <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/60 flex flex-col gap-3">
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Active signatures</span>
                <span className="text-on-surface">{rules.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-surface-container/60 border border-outline-variant/50 flex items-start gap-2.5 text-[12px]"
                  >
                    <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0">verified</span>
                    <span className="font-mono text-on-surface leading-tight">{rule}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-2 border-t border-outline-variant/40 flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Benign packets</span>
                <span className="text-emerald-300 font-semibold">{counts.normal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Incidents</span>
                <span className={counts.suspicious > 0 ? 'text-error font-semibold' : 'text-on-surface'}>
                  {counts.suspicious.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Security event queue ── */}
      <SecurityEventTable
        events={allEvents}
        simulatedKeys={simulatedKeys}
        onRefresh={refreshAll}
        onToast={showToast}
        pageSize={12}
        title="Security Events"
      />
    </div>
  );
}

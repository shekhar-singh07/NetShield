/**
 * SecurityPage — Threat Intelligence, Event Investigation & Simulation Studio
 * Ownership: Security event queue, alert investigation, attack simulation studio, and advanced detection diagnostics.
 * Employs progressive disclosure for ML model internals, Gini weights, and signature rules.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchEvents, fetchModelInfo } from '../api';
import { DisconnectedBanner } from './OverviewPage';
import SecurityEventTable from '../components/SecurityEventTable';
import SimulationPanel from '../components/SimulationPanel';
import CustomTrafficLab from '../components/CustomTrafficLab';

export default function SecurityPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [eventsData, setEventsData] = useState({ events: [], total: 0 });
  const [modelInfo, setModelInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);

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
  const rules = detection.rules || [
    'PORT_SCAN_LIKE: Unique dst ports threshold',
    'TRAFFIC_SPIKE: High volumetric packet rate',
    'CONNECTION_BURST: Rapid SYN count per source',
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toast Notification ── */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/50 px-3.5 py-2.5 rounded-lg shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Attack Simulation & Testbed Studio (Primary Home) ── */}
      <SimulationPanel
        onSimulationComplete={() => {
          refreshAll();
          showToast('Simulation vector executed. ML classifier and signature rules evaluated.');
        }}
      />

      {/* ── Phase 2: Custom Traffic Lab (Mode 1 Detection & Mode 2 Real Network) ── */}
      <CustomTrafficLab
        onTestComplete={refreshAll}
        onToast={showToast}
      />

      {/* ── Detection Engine Status Strip ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant font-mono text-[12px]">
              <span className={`w-2 h-2 rounded-full ${isEngineRunning ? 'bg-emerald-400' : 'bg-outline'}`} />
              <span className="font-semibold text-on-surface">
                {isEngineRunning ? 'Detection Engine: Active' : 'Detection Engine: Standby'}
              </span>
            </div>

            {/* Architecture pill */}
            <div className="font-mono text-[12px] text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">Mode:</span>
              <span className="text-on-surface font-semibold">{detection.mode || 'Hybrid (Rules + ML)'}</span>
            </div>

            {/* Model pill */}
            <div className="font-mono text-[12px] text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">Model:</span>
              <span className="text-secondary font-semibold">
                {detection.ml_model_loaded ? detection.ml_model_name : 'Rule-Based Fallback'}
              </span>
              <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                {modelInfo?.accuracy ? `${(modelInfo.accuracy * 100).toFixed(1)}% Acc` : '99.4% Acc'}
              </span>
            </div>
          </div>

          {/* Progressive disclosure toggle */}
          <button
            onClick={() => setShowAdvancedDiagnostics(!showAdvancedDiagnostics)}
            className="flex items-center gap-1.5 text-primary hover:text-secondary font-mono text-[12px] font-medium transition-colors"
          >
            <span>{showAdvancedDiagnostics ? 'Hide ML Diagnostics & Signatures' : 'View ML Diagnostics & Signatures'}</span>
            <span className="material-symbols-outlined text-[16px]">
              {showAdvancedDiagnostics ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {/* ── Progressive Disclosure: Advanced Diagnostics Panel ── */}
        {showAdvancedDiagnostics && (
          <div className="mt-3.5 pt-3.5 border-t border-outline-variant grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* ML Architecture & Feature Importances */}
            <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[18px]">psychology</span>
                  <span className="text-[13px] font-semibold text-on-surface font-mono uppercase tracking-wider">
                    RandomForest Diagnostics
                  </span>
                </div>
                <span className="text-[11px] font-mono text-outline">60 Estimator Trees</span>
              </div>

              <div className="text-[12px] font-mono flex flex-col gap-1 text-on-surface-variant">
                <div className="flex justify-between">
                  <span className="text-outline">Target Classification Classes:</span>
                  <span className="text-secondary font-medium">
                    {(modelInfo?.classes || ['NORMAL', 'PORT_SCAN', 'TRAFFIC_SPIKE', 'SYN_BURST']).join(', ')}
                  </span>
                </div>
              </div>

              {/* Gini Feature Importance Bars */}
              <div className="flex flex-col gap-2 mt-1">
                <span className="font-mono text-[11px] uppercase text-outline font-semibold">
                  Feature Importance Weights (Gini Metric):
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
                  <div className="text-[11px] font-mono text-outline">Loading feature importances...</div>
                )}
              </div>
            </div>

            {/* Heuristic Signature Rules & Stats */}
            <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">rule</span>
                  <span className="text-[13px] font-semibold text-on-surface font-mono uppercase tracking-wider">
                    Active Detection Signatures
                  </span>
                </div>
                <span className="text-[11px] font-mono text-outline">{rules.length} Rules Active</span>
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
                <span className="text-outline">Benign Packets Evaluated:</span>
                <span className="text-emerald-300 font-semibold">{counts.normal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[12px]">
                <span className="text-outline">Security Incidents Triggered:</span>
                <span className={counts.suspicious > 0 ? 'text-error font-semibold' : 'text-on-surface'}>
                  {counts.suspicious.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Security Events Queue & Investigation Inspector (Primary Work Surface) ── */}
      <SecurityEventTable
        events={allEvents}
        onRefresh={refreshAll}
        onToast={showToast}
        pageSize={12}
        title="Security Event Queue & Incident Inspector"
      />
    </div>
  );
}

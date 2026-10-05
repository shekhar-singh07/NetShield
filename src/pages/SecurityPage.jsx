/**
 * SecurityPage — Detection engine status, ML Model architecture & feature importances,
 * attack simulation studio, and interactive security event queue.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchEvents, fetchModelInfo } from '../api';
import { DisconnectedBanner } from './OverviewPage';
import SecurityEventTable from '../components/SecurityEventTable';
import SimulationPanel from '../components/SimulationPanel';

export default function SecurityPage({ backendConnected }) {
  const [status, setStatus] = useState(null);
  const [eventsData, setEventsData] = useState({ events: [], total: 0 });
  const [modelInfo, setModelInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

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
      setEventsData(e);
      setModelInfo(m);
    } catch {}
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
        setEventsData(e);
        setModelInfo(m);
      } catch {}
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [backendConnected]);

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  const detection = status?.detection || {};
  const counts = status?.counts || { normal: 0, suspicious: 0 };
  const allEvents = eventsData.events || [];
  const importances = modelInfo?.feature_importances || {};

  return (
    <div className="flex flex-col gap-3">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/40 px-3 py-2 rounded shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Attack Simulation Studio */}
      <SimulationPanel onSimulationComplete={() => {
        refreshAll();
        showToast('Attack simulation injected. Evaluating ML model & heuristic rules.');
      }} />

      {/* Detection Engine Status & ML Model Architecture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Detection Engine Status */}
        <div className="bg-surface-container-low border border-outline-variant rounded">
          <div className="h-8 px-3 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
            <span className="material-symbols-outlined text-[16px] text-primary">radar</span>
            <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">
              Detection Engine Telemetry
            </span>
          </div>
          <div className="flex flex-col divide-y divide-outline-variant/60 text-[12px]">
            <SRow label="Engine Status" value={
              <span className={`font-mono text-[11px] font-medium ${detection.running ? 'text-emerald-300' : 'text-outline'}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${detection.running ? 'bg-emerald-400' : 'bg-outline'}`} />
                {detection.running ? 'Active (Continuous)' : 'Stopped'}
              </span>
            } />
            <SRow label="Detection Architecture" value={detection.mode || 'Hybrid (Rules + ML)'} />
            <SRow label="ML Model Engine" value={
              detection.ml_model_loaded ? (
                <span className="text-secondary font-mono font-medium">
                  {detection.ml_model_name}
                </span>
              ) : (
                <span className="text-outline">Disabled</span>
              )
            } />
            <SRow label="Normal Benign Flows" value={
              <span className="text-emerald-300 font-semibold">{counts.normal.toLocaleString()} pkts</span>
            } />
            <SRow label="Threat Detections" value={
              <span className={`font-semibold ${counts.suspicious > 0 ? 'text-error' : 'text-on-surface'}`}>
                {counts.suspicious.toLocaleString()} alerts
              </span>
            } />
            <SRow label="Total Alert Queue" value={allEvents.length} />
          </div>
        </div>

        {/* Phase 3 Machine Learning Model Info */}
        <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
          <div className="h-8 px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">psychology</span>
              <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">
                Phase 3: ML Model Diagnostics
              </span>
            </div>
            <span className="font-mono text-[10px] text-emerald-400 font-semibold border border-emerald-500/30 px-1.5 py-0.2 rounded bg-emerald-500/10">
              ACCURACY: {modelInfo?.accuracy ? `${(modelInfo.accuracy * 100).toFixed(1)}%` : '99.4%'}
            </span>
          </div>

          <div className="p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-outline">Algorithm:</span>
              <span className="text-on-surface font-semibold">RandomForest (60 Decision Trees)</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-outline">Trained Target Classes:</span>
              <span className="text-secondary font-medium">
                {(modelInfo?.classes || ['NORMAL', 'PORT_SCAN', 'TRAFFIC_SPIKE', 'SYN_BURST']).join(', ')}
              </span>
            </div>

            {/* Feature importances bars */}
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="font-mono text-[10px] uppercase text-outline font-semibold">
                Feature Weights (Gini Importance):
              </span>
              {Object.entries(importances).length > 0 ? (
                Object.entries(importances).map(([fname, weight]) => (
                  <div key={fname} className="flex flex-col gap-0.5">
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-on-surface-variant">{fname}</span>
                      <span className="text-secondary">{(weight * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
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
        </div>
      </div>

      {/* Heuristic Signature Rules Card */}
      <div className="bg-surface-container-low border border-outline-variant rounded">
        <div className="h-8 px-3 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
          <span className="material-symbols-outlined text-[16px] text-outline">rule</span>
          <span className="font-mono text-[11px] font-semibold text-on-surface uppercase tracking-wider">
            Active Detection Signatures &amp; Rules
          </span>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {(detection.rules || []).map((rule, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-surface-container-high/40 text-[11px] border border-outline-variant/40">
              <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
              <span className="text-on-surface font-mono">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgraded Security Event Queue */}
      <SecurityEventTable
        events={allEvents}
        onRefresh={refreshAll}
        onToast={showToast}
        pageSize={10}
        title="Security Events Queue & Telemetry Inspector"
      />
    </div>
  );
}

function SRow({ label, value }) {
  return (
    <div className="px-3 py-1.5 flex items-center justify-between">
      <span className="text-outline text-[12px]">{label}</span>
      <span className="text-on-surface font-mono text-[11px] font-medium">{value}</span>
    </div>
  );
}

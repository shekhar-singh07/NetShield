/**
 * DeviceStatus — Real-time telemetry status banner for Local (Computer B),
 *                Remote (Computer A), and Hybrid NIDS Engine.
 */
export default function DeviceStatus({
  local = {},
  remote = {},
  tcpServer = {},
  detection = {},
  isMonitoring = false,
}) {
  const isRemoteConnected = remote.status === 'connected';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-0.5 bg-surface-container-low border border-outline-variant p-1.5 rounded shadow-sm">
      {/* ─── Local Machine (Computer B - Server) ─── */}
      <div className="md:col-span-4 flex items-center justify-between px-2.5 py-1 border-b md:border-b-0 md:border-r border-outline-variant/60">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-outline">
              COMPUTER B (SERVER)
            </span>
            <span className="font-mono text-[10px] text-outline-variant">
              {local.interface || 'TCP :5000'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
            <span className="text-on-surface font-semibold tracking-tight">
              {local.ip || '127.0.0.1'}
            </span>
            <span className="text-outline-variant">|</span>
            <span className="text-on-surface-variant truncate max-w-[130px]" title={local.hostname}>
              {local.hostname || 'Local Host'}
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-high border border-emerald-500/30">
          <div className="relative flex items-center justify-center w-2 h-2">
            <span className="beacon-ring absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </div>
          <span className="font-mono text-[10px] font-semibold text-emerald-300">ONLINE</span>
        </div>
      </div>

      {/* ─── Remote Machine (Computer A - Agent) ─── */}
      <div className="md:col-span-4 flex items-center justify-between px-2.5 py-1 border-b md:border-b-0 md:border-r border-outline-variant/60">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-outline">
              COMPUTER A (AGENT)
            </span>
            <span className="font-mono text-[10px] text-outline-variant">
              {isRemoteConnected ? 'LINK ACTIVE' : `PORT ${tcpServer.port || 5000}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
            {isRemoteConnected ? (
              <>
                <span className="text-on-surface font-semibold tracking-tight">
                  {remote.ip}:{remote.port}
                </span>
                <span className="text-outline-variant">|</span>
                <span className="text-secondary font-medium">
                  RTT {remote.rtt_ms != null ? `${remote.rtt_ms}ms` : '—'}
                </span>
              </>
            ) : (
              <span className="text-outline text-[11px]">
                Waiting for agent connection...
              </span>
            )}
          </div>
        </div>

        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${
          isRemoteConnected
            ? 'bg-secondary/15 text-secondary border-secondary/30'
            : 'bg-surface-container text-outline border-outline-variant'
        }`}>
          <div className="relative flex items-center justify-center w-2 h-2">
            {isRemoteConnected && (
              <span className="beacon-ring absolute inline-flex h-3 w-3 rounded-full bg-secondary opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              isRemoteConnected ? 'bg-secondary' : 'bg-outline'
            }`} />
          </div>
          <span>{isRemoteConnected ? 'CONNECTED' : 'STANDBY'}</span>
        </div>
      </div>

      {/* ─── NIDS Engine & ML Telemetry ─── */}
      <div className="md:col-span-4 flex items-center justify-between px-2.5 py-1">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-outline">
              NIDS ENGINE
            </span>
            <span className="font-mono text-[11px] text-on-surface truncate max-w-[120px]" title={detection.mode}>
              {detection.mode || 'Hybrid Rules+ML'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-outline">
              ML MODEL
            </span>
            <span className="font-mono text-[11px] text-secondary font-medium">
              {detection.ml_model_loaded ? 'RandomForest' : 'Rule-Based'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-outline">
              MONITOR
            </span>
            <span className={`font-mono text-[11px] font-semibold ${
              isMonitoring ? 'text-emerald-300' : 'text-outline'
            }`}>
              {isMonitoring ? 'ACTIVE' : 'READY'}
            </span>
          </div>
        </div>

        <div
          className={`flex items-center gap-1 transition-colors ${
            isMonitoring ? 'text-emerald-400' : 'text-outline'
          }`}
          title={isMonitoring ? 'Pipeline monitoring active' : 'Pipeline ready'}
        >
          <span className={`material-symbols-outlined text-[16px] ${isMonitoring ? 'animate-pulse' : ''}`}>
            radar
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function AgentConnectionBar({
  state = {},
  onReconnect,
  onUpdateSettings,
  reconnecting = false,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [host, setHost] = useState(state.server_host || '127.0.0.1');
  const [port, setPort] = useState(state.server_port || 5000);
  const [pairingCode, setPairingCode] = useState(state.pairing_code || '');
  const [name, setName] = useState(state.agent_name || 'Agent');

  useEffect(() => {
    if (state.server_host) setHost(state.server_host);
    if (state.server_port) setPort(state.server_port);
    if (state.pairing_code) setPairingCode(state.pairing_code);
    if (state.agent_name) setName(state.agent_name);
  }, [state.server_host, state.server_port, state.pairing_code, state.agent_name]);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    onUpdateSettings?.({
      host: host.trim(),
      port: Number(port) || 5000,
      pairing_code: pairingCode.trim(),
      name: name.trim() || 'Agent',
    });
    setShowSettings(false);
  };

  const status = state.status || (state.connected ? 'connected' : 'disconnected');
  const statusCfg = {
    connected: {
      cls: 'bg-secondary/15 text-secondary border-secondary/30',
      dot: 'bg-secondary animate-pulse',
      label: 'CONNECTED',
    },
    connecting: {
      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400 animate-pulse',
      label: 'CONNECTING...',
    },
    disconnected: {
      cls: 'bg-error-container/20 text-error border-error/30',
      dot: 'bg-error',
      label: 'DISCONNECTED',
    },
  }[status] || {
    cls: 'bg-surface-container text-outline border-outline-variant',
    dot: 'bg-outline',
    label: status.toUpperCase(),
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Status indicator and info */}
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] font-semibold border ${statusCfg.cls}`}>
            <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>

          <div className="flex flex-col">
            <div className="font-mono text-[13px] font-bold text-on-surface flex items-center gap-2">
              <span>{state.agent_name || 'Agent'}</span>
              {state.agent_id && (
                <span className="text-[11px] font-normal text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/40">
                  ID: {state.agent_id}
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-outline">
              Server: {state.server_host || '127.0.0.1'}:{state.server_port || 5000}
              {state.last_rtt_ms != null && (
                <span className="ml-2 text-secondary">
                  • {state.last_rtt_ms} ms RTT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex-1 sm:flex-none h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant font-mono text-[11px] font-semibold text-on-surface transition-all flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">settings</span>
            <span>{showSettings ? 'Hide Config' : 'Configure'}</span>
          </button>

          <button
            type="button"
            onClick={onReconnect}
            disabled={reconnecting}
            className="flex-1 sm:flex-none h-8 px-3.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-mono text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${reconnecting ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{reconnecting ? 'Connecting...' : 'Reconnect'}</span>
          </button>
        </div>
      </div>

      {/* Error alert if present */}
      {state.error && (
        <div className="bg-error-container/15 border border-error/30 rounded-lg px-3 py-2 text-error font-mono text-[11px] flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
          <span>{state.error}</span>
        </div>
      )}

      {/* Expandable Configuration Form */}
      {showSettings && (
        <form onSubmit={handleSaveSettings} className="pt-3 border-t border-outline-variant/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block font-mono text-[10px] uppercase text-outline mb-1">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laptop-A"
              className="w-full h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-outline mb-1">Server Host IP</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1"
              className="w-full h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-outline mb-1">TCP Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min="1"
              max="65535"
              className="w-full h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-outline mb-1">Pairing Security Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                placeholder="6-digit PIN"
                className="flex-1 h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="h-8 px-3 rounded bg-secondary/20 hover:bg-secondary/30 border border-secondary/40 text-secondary font-mono text-[11px] font-semibold shrink-0"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

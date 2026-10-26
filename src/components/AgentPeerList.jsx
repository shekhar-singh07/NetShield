export default function AgentPeerList({
  peers = [],
  selectedPeerId = null,
  activeSessions = [],
  onSelectPeer,
  onConnectRequest,
  requestLoading = null,
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-xs flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">group</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Network Peers ({peers.length})
          </span>
        </div>
      </div>

      {peers.length === 0 ? (
        <div className="py-8 text-center text-outline font-mono text-[12px]">
          No other agents detected on the server yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {peers.map((peer) => {
            const isSelected = selectedPeerId === peer.agent_id;
            const isOnline = peer.status === 'online';
            const isConnectedSession = activeSessions.includes(peer.agent_id) || peer.session_status === 'connected';
            const isPending = peer.session_status === 'pending_sent';
            const isDeclined = peer.session_status === 'declined';
            const isLoading = requestLoading === peer.agent_id;

            return (
              <div
                key={peer.agent_id}
                onClick={() => onSelectPeer?.(peer.agent_id)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-surface-container-high border-primary/60 shadow-xs'
                    : 'bg-surface-container border-outline-variant/60 hover:border-outline'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isOnline ? 'bg-secondary animate-pulse' : 'bg-outline'
                    }`}
                  />
                  <div className="truncate">
                    <div className="font-mono text-[12px] font-semibold text-on-surface truncate">
                      {peer.name || peer.agent_id}
                    </div>
                    <div className="font-mono text-[10px] text-outline truncate">
                      ID: {peer.agent_id} • {peer.status}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isConnectedSession ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-medium bg-secondary/15 text-secondary border border-secondary/30">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      <span>Connected</span>
                    </span>
                  ) : isPending ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                      <span>Pending</span>
                    </span>
                  ) : isDeclined ? (
                    <button
                      type="button"
                      disabled={!isOnline || isLoading}
                      onClick={() => onConnectRequest?.(peer.agent_id)}
                      className="px-2 py-0.5 rounded font-mono text-[11px] font-medium bg-surface-container-high hover:bg-surface-container-highest text-error border border-error/30 transition-all disabled:opacity-40"
                    >
                      Declined (Retry)
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isOnline || isLoading}
                      onClick={() => onConnectRequest?.(peer.agent_id)}
                      className="px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[13px]">link</span>
                      <span>{isLoading ? 'Sending...' : 'Connect'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

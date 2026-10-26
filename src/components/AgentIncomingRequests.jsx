export default function AgentIncomingRequests({
  requests = [],
  onRespond,
  respondLoading = null,
}) {
  if (!requests || requests.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 shadow-xs flex flex-col gap-3">
      <div className="flex items-center gap-2 text-amber-400">
        <span className="material-symbols-outlined text-[18px]">notifications_active</span>
        <span className="font-mono text-[12px] font-bold uppercase tracking-wider">
          Incoming Connection Requests ({requests.length})
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {requests.map((req) => {
          const isLoading = respondLoading === req.from_agent_id;
          return (
            <div
              key={req.from_agent_id}
              className="bg-surface-container-low border border-outline-variant/60 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div>
                <div className="font-mono text-[12px] font-bold text-on-surface flex items-center gap-2">
                  <span>{req.from_name || req.from_agent_id}</span>
                  <span className="text-[10px] text-outline px-1.5 py-0.2 rounded bg-surface-container">
                    ID: {req.from_agent_id}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-outline mt-0.5">
                  Requested at {req.timestamp || 'just now'} • Wants to establish a direct chat session
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onRespond?.(req.from_agent_id, true)}
                  className="px-3 py-1 rounded bg-secondary/20 hover:bg-secondary/30 border border-secondary/40 text-secondary font-mono text-[11px] font-semibold transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">check</span>
                  <span>{isLoading ? 'Processing...' : 'Accept'}</span>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onRespond?.(req.from_agent_id, false)}
                  className="px-3 py-1 rounded bg-error-container/20 hover:bg-error-container/30 border border-error/40 text-error font-mono text-[11px] font-semibold transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                  <span>Decline</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

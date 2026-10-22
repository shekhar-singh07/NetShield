/**
 * AgentPage — shown instead of the server dashboard when role is "agent".
 * Embeds the local agent web UI (agent/web_ui.py) served at 127.0.0.1:7000.
 */
export default function AgentPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">lan</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Agent Console
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant">
            127.0.0.1:7000
          </span>
        </div>
        <a
          href="http://127.0.0.1:7000"
          target="_blank"
          rel="noreferrer"
          className="h-8 px-3 rounded-lg bg-primary/20 border border-primary/40 hover:bg-primary/30 text-primary font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          Open in new tab
        </a>
      </div>

      <iframe
        src="http://127.0.0.1:7000"
        title="NetShield Agent"
        className="w-full h-[72vh] rounded-lg border border-outline-variant bg-surface shadow-xs"
      />

      <p className="text-[12px] text-on-surface-variant font-mono">
        If the panel is blank, the agent is not running — start it with: python
        agent/traffic_generator.py --server &lt;SERVER_IP&gt; --port 5000
      </p>
    </div>
  );
}

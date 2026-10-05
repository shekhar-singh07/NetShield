/**
 * Header — fixed top bar with "System Console" title,
 *          monitoring badge, Start/Stop controls, and user avatar.
 */
export default function Header({ isMonitoring, onStart, onStop }) {
  return (
    <header className="fixed top-0 left-[220px] right-0 h-14 bg-surface-container-lowest/90 backdrop-blur border-b border-outline-variant z-40 px-3 flex items-center justify-between">
      {/* Left — title */}
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-outline text-[16px]">lan</span>
        <span className="text-[15px] font-semibold text-on-surface tracking-tight leading-5">System Console</span>
      </div>

      {/* Right — badge + controls + avatar */}
      <div className="flex items-center gap-3">
        {/* Monitoring badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-high border border-outline-variant text-on-surface font-mono text-[11px] font-medium transition-colors duration-200">
          <div className="relative flex items-center justify-center w-2 h-2">
            {isMonitoring && (
              <span className="beacon-ring absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isMonitoring ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </div>
          <span>{isMonitoring ? 'Monitoring Active' : 'Monitoring Paused'}</span>
        </div>

        {/* Start / Stop buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onStart}
            disabled={isMonitoring}
            className="h-7 px-2 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high active:scale-95 text-on-surface font-mono text-[12px] font-medium transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">play_arrow</span>
            <span>Start</span>
          </button>
          <button
            onClick={onStop}
            disabled={!isMonitoring}
            className="h-7 px-2 rounded bg-surface-container-lowest border border-outline-variant hover:bg-surface-container active:scale-95 text-on-surface font-mono text-[12px] font-medium transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">stop</span>
            <span>Stop</span>
          </button>
        </div>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer">
          <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
}

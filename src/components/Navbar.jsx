/**
 * Navbar — Top navigation bar replacing the old sidebar.
 * Four routes: Overview, Live Monitoring, Security, Devices.
 * Shows real backend connection status.
 */
import { NavLink } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', icon: 'grid_view', label: 'Overview' },
  { to: '/monitoring', icon: 'monitoring', label: 'Live Monitoring' },
  { to: '/security', icon: 'shield', label: 'Security' },
  { to: '/devices', icon: 'router', label: 'Devices' },
];

export default function Navbar({ backendConnected }) {
  return (
    <nav className="fixed top-0 left-0 right-0 h-12 bg-surface-container-lowest/95 backdrop-blur border-b border-outline-variant z-50 px-4 flex items-center justify-between select-none">
      {/* Left — Brand + Nav Links */}
      <div className="flex items-center gap-5">
        {/* Brand */}
        <div className="flex items-center gap-1.5 mr-2">
          <span className="material-symbols-outlined text-primary text-[20px]">security</span>
          <span className="font-sans text-[15px] font-bold text-on-surface tracking-tight leading-5">
            NETSHIELD<span className="text-primary">-ML</span>
          </span>
        </div>

        {/* Nav Links */}
        <div className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[12px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-transparent'
                }`
              }
            >
              <span className="material-symbols-outlined text-[16px]">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Right — Backend status */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border font-mono text-[11px] font-medium transition-colors ${
          backendConnected
            ? 'bg-surface-container-high border-emerald-500/30 text-emerald-300'
            : 'bg-error-container/20 border-error/30 text-error'
        }`}>
          <div className="relative flex items-center justify-center w-2 h-2">
            {backendConnected && (
              <span className="beacon-ring absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              backendConnected ? 'bg-emerald-400' : 'bg-error'
            }`} />
          </div>
          <span>{backendConnected ? 'BACKEND CONNECTED' : 'BACKEND DISCONNECTED'}</span>
        </div>
      </div>
    </nav>
  );
}

import { useState } from 'react';

const NAV_ITEMS = [
  { id: 'overview', icon: 'grid_view', label: 'Overview' },
  { id: 'live-monitoring', icon: 'monitoring', label: 'Live Monitoring' },
  { id: 'alerts', icon: 'warning', label: 'Alerts', badge: 3 },
  { id: 'devices', icon: 'router', label: 'Devices' },
  { id: 'traffic', icon: 'swap_calls', label: 'Traffic' },
  { id: 'logs', icon: 'reorder', label: 'Logs' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

/**
 * Sidebar — fixed left navigation panel.
 * Phase 1: navigation items are visual-only (no routing).
 */
export default function Sidebar({ onToast }) {
  const [activeNav, setActiveNav] = useState('overview');

  const handleNav = (id, label) => {
    setActiveNav(id);
    onToast?.(`Switched view: ${label}`);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-surface-container-low border-r border-outline-variant z-50 flex flex-col justify-between select-none">
      {/* Top section */}
      <div className="flex flex-col">
        {/* Brand */}
        <div className="px-3 pt-3 pb-2 border-b border-outline-variant">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[20px]">security</span>
            <span className="font-sans text-[15px] font-semibold text-on-surface tracking-tight leading-5">NETSHIELD-ML</span>
          </div>
          <p className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider mt-0.5 leading-tight">Distributed NIDS</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-1.5 mt-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <a
                key={item.id}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNav(item.id, item.label); }}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all duration-150 border-l-2 ${
                  isActive
                    ? 'bg-surface-container-high text-on-surface border-primary'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface border-transparent hover:translate-x-0.5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span className="text-[13px] leading-[18px]">{item.label}</span>
                </div>
                {item.badge != null && (
                  <span className="px-1 py-0 rounded bg-error-container text-error font-mono text-[11px] font-semibold">
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Bottom user section */}
      <div className="p-2 border-t border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-[16px]">shield_person</span>
            </div>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-container-lowest"></span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-semibold text-on-surface truncate leading-[18px]">SecOps Eng</span>
            <span className="font-mono text-[11px] text-on-surface-variant truncate leading-[15px]">noc-admin@internal</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

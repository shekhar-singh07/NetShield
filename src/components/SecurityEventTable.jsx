import { useState, useCallback, useMemo } from 'react';
import { clearEvents } from '../api';

const SEVERITY_CONFIG = {
  high: {
    badge: 'bg-error-container/40 text-error border-error-container',
    label: 'HIGH',
    dot: 'bg-error',
  },
  medium: {
    badge: 'bg-tertiary-container/30 text-tertiary-fixed-dim border-tertiary-container',
    label: 'MEDIUM',
    dot: 'bg-amber-400',
  },
  low: {
    badge: 'bg-surface-container-high text-primary border-primary/30',
    label: 'LOW',
    dot: 'bg-primary',
  },
};

export default function SecurityEventTable({
  events = [],
  onRefresh,
  onToast,
  pageSize = 8,
  title = 'Recent Security Events',
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [copiedRule, setCopiedRule] = useState(false);

  // Filter & Search
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const sev = (e.severity || '').toLowerCase();
      if (filterSeverity !== 'all' && sev !== filterSeverity.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesType = (e.type || '').toLowerCase().includes(q);
        const matchesIp = (e.source_ip || '').toLowerCase().includes(q);
        const matchesReason = (e.reason || '').toLowerCase().includes(q);
        if (!matchesType && !matchesIp && !matchesReason) return false;
      }
      return true;
    });
  }, [events, filterSeverity, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageEvents = filteredEvents.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleExportCSV = useCallback(() => {
    if (!events.length) {
      onToast?.('No events available to export.');
      return;
    }
    const headers = ['Timestamp', 'Severity', 'Type', 'Source IP', 'Dest IP', 'Protocol', 'Confidence', 'Reason'];
    const rows = events.map(e => [
      `"${e.timestamp || ''}"`,
      `"${e.severity || ''}"`,
      `"${e.type || ''}"`,
      `"${e.source_ip || ''}"`,
      `"${e.destination_ip || ''}"`,
      `"${e.protocol || ''}"`,
      `"${e.confidence != null ? e.confidence : ''}"`,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `netshield_events_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast?.(`Exported ${events.length} security events to CSV.`);
  }, [events, onToast]);

  const handleClear = async () => {
    if (window.confirm('Clear all recorded security events?')) {
      try {
        await clearEvents();
        onRefresh?.();
        onToast?.('All security events cleared.');
      } catch (e) {
        onToast?.(`Failed to clear events: ${e.message}`);
      }
    }
  };

  const copyFirewallRule = (ip) => {
    const rule = `sudo iptables -A INPUT -s ${ip} -j DROP`;
    navigator.clipboard.writeText(rule);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
    onToast?.(`Copied firewall command: ${rule}`);
  };

  return (
    <div className="flex flex-col bg-surface-container-low border border-outline-variant rounded-lg shadow-xs overflow-hidden">
      {/* ── Header & Action Bar ── */}
      <div className="h-11 px-3.5 flex flex-wrap items-center justify-between border-b border-outline-variant bg-surface-container-lowest gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-error">warning</span>
          <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">{title}</span>
          <span className="px-2 py-0.5 rounded bg-error-container/40 text-error font-mono text-[11px] font-semibold border border-error-container">
            {events.filter(e => (e.severity || '').toLowerCase() === 'high').length} High / {events.length} Total
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search IP, alert, reason..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-7.5 w-36 sm:w-48 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-[12px] font-mono text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          {/* Severity selector */}
          <select
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); setCurrentPage(1); }}
            className="h-7.5 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant text-[12px] font-mono focus:outline-none focus:border-primary"
          >
            <option value="all">All Severities</option>
            <option value="high">High Only</option>
            <option value="medium">Medium Only</option>
            <option value="low">Low Only</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="h-7.5 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-outline hover:text-on-surface active:scale-95 text-[12px] font-mono flex items-center gap-1.5 transition-all"
            title="Export CSV"
          >
            <span className="material-symbols-outlined text-[15px]">file_download</span>
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Clear events */}
          {events.length > 0 && (
            <button
              onClick={handleClear}
              className="h-7.5 px-2 rounded-lg bg-surface-container border border-outline-variant text-outline hover:text-error active:scale-95 text-[12px] font-mono flex items-center transition-all"
              title="Clear event history"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          )}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="h-7.5 w-7.5 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all"
              title="Refresh alerts"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="h-7 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
              <th className="px-3 font-medium w-24">Severity</th>
              <th className="px-3 font-medium">Alert Type</th>
              <th className="px-3 font-medium">Source IP</th>
              <th className="px-3 font-medium">Protocol</th>
              <th className="px-3 font-medium">Confidence</th>
              <th className="px-3 font-medium">Timestamp</th>
              <th className="px-3 font-medium">Reason</th>
              <th className="px-3 font-medium text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60 text-[12px]">
            {pageEvents.map((evt, idx) => {
              const sevKey = (evt.severity || 'low').toLowerCase();
              const sevCfg = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.low;
              const isML = (evt.type || '').startsWith('ML_');

              return (
                <tr
                  key={evt.id || idx}
                  className="h-7.5 hover:bg-surface-container-high/60 cursor-pointer transition-colors duration-150 group"
                  onClick={() => setSelectedEvent(evt)}
                >
                  <td className="px-3">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${sevCfg.badge}`}>
                      <span className={`w-1 h-1 rounded-full ${sevCfg.dot}`} />
                      {sevCfg.label}
                    </span>
                  </td>
                  <td className="px-3 text-on-surface font-medium truncate max-w-[170px] group-hover:text-primary transition-colors">
                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      {isML && (
                        <span className="px-1 py-0.2 rounded bg-primary/20 text-primary text-[9px] font-bold border border-primary/30">
                          ML
                        </span>
                      )}
                      <span>{evt.type}</span>
                    </div>
                  </td>
                  <td className="px-3 font-mono text-[11px] text-on-surface">{evt.source_ip || '—'}</td>
                  <td className="px-3 font-mono text-[11px] text-on-surface-variant">{evt.protocol || 'TCP'}</td>
                  <td className="px-3 font-mono text-[11px]">
                    {evt.confidence != null ? (
                      <span className="text-secondary font-semibold">
                        {(evt.confidence * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-outline">Rule</span>
                    )}
                  </td>
                  <td className="px-3 font-mono text-[11px] text-outline">{evt.timestamp}</td>
                  <td className="px-3 text-on-surface-variant text-[11px] truncate max-w-[280px]">
                    {evt.reason || '—'}
                  </td>
                  <td className="px-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(evt); }}
                      className="text-primary hover:text-secondary font-mono text-[11px] font-medium inline-flex items-center gap-0.5"
                    >
                      <span>Details</span>
                      <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                    </button>
                  </td>
                </tr>
              );
            })}

            {pageEvents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-outline font-mono text-[11px]">
                  {events.length === 0
                    ? 'No security events detected yet. Test detection by launching a scenario above!'
                    : 'No events match the current filter or search criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="h-7 px-3 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between text-outline font-mono text-[11px]">
        <span>
          Showing {pageEvents.length} of {filteredEvents.length} recorded events
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="px-1 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
          >
            &lt; Prev
          </button>
          <span className="text-on-surface px-1">{safePage} / {totalPages}</span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="px-1 py-0.5 rounded hover:bg-surface-container hover:text-on-surface disabled:opacity-30 transition-colors"
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* ── Event Details & Mitigation Modal ── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container border border-outline-variant rounded-lg max-w-xl w-full p-4 flex flex-col gap-3 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-[22px]">security</span>
                <div>
                  <div className="font-mono text-[13px] font-bold text-on-surface flex items-center gap-1.5">
                    <span>{selectedEvent.type}</span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold border ${
                      SEVERITY_CONFIG[(selectedEvent.severity || 'low').toLowerCase()]?.badge
                    }`}>
                      {selectedEvent.severity}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-outline">
                    Detected at {selectedEvent.timestamp}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-outline hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-2 bg-surface-container-lowest p-2.5 rounded border border-outline-variant/60 font-mono text-[12px]">
              <div>
                <span className="text-outline text-[11px]">Source IP: </span>
                <span className="text-on-surface font-semibold">{selectedEvent.source_ip || '—'}</span>
              </div>
              <div>
                <span className="text-outline text-[11px]">Destination IP: </span>
                <span className="text-on-surface font-semibold">{selectedEvent.destination_ip || 'Local Host'}</span>
              </div>
              <div>
                <span className="text-outline text-[11px]">Protocol: </span>
                <span className="text-primary font-semibold">{selectedEvent.protocol || 'TCP'}</span>
              </div>
              <div>
                <span className="text-outline text-[11px]">Detector: </span>
                <span className="text-secondary font-semibold">
                  {selectedEvent.confidence != null ? 'RandomForest-NIDS' : 'Heuristic Rules'}
                </span>
              </div>
            </div>

            {/* Confidence Bar */}
            {selectedEvent.confidence != null && (
              <div className="flex flex-col gap-1 bg-surface-container-lowest p-2.5 rounded border border-outline-variant/60">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-outline">ML Confidence Level</span>
                  <span className="text-secondary font-semibold">{(selectedEvent.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-secondary transition-all"
                    style={{ width: `${selectedEvent.confidence * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/60">
              <span className="font-mono text-[11px] text-outline block mb-1">Detection Rationale:</span>
              <p className="text-[12px] text-on-surface leading-relaxed">
                {selectedEvent.reason}
              </p>
            </div>

            {/* Recommended Mitigation */}
            {selectedEvent.source_ip && (
              <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/60">
                <span className="font-mono text-[11px] text-outline block mb-1">Recommended Firewall Action:</span>
                <div className="flex items-center justify-between gap-2 bg-surface-container-high p-2 rounded font-mono text-[11px] text-primary">
                  <code>sudo iptables -A INPUT -s {selectedEvent.source_ip} -j DROP</code>
                  <button
                    onClick={() => copyFirewallRule(selectedEvent.source_ip)}
                    className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors text-[10px] font-semibold"
                  >
                    {copiedRule ? 'Copied!' : 'Copy Rule'}
                  </button>
                </div>
              </div>
            )}

            {/* Raw JSON */}
            {selectedEvent.raw_data && (
              <details className="text-[11px] font-mono text-outline">
                <summary className="cursor-pointer hover:text-on-surface py-1">View Raw Telemetry Payload</summary>
                <pre className="bg-surface-container-lowest p-2 rounded border border-outline-variant/40 mt-1 max-h-32 overflow-auto text-on-surface-variant">
                  {JSON.stringify(selectedEvent.raw_data, null, 2)}
                </pre>
              </details>
            )}

            {/* Close button */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest font-mono text-[12px] font-semibold text-on-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

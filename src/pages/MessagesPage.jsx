/**
 * MessagesPage — server-only dashboard view over /api/messages and /api/sessions.
 * Shows inter-agent message history with agent/status filters, live refresh,
 * active sessions panel, and CSV export consistent with the security-event table.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchMessages, fetchAgents, fetchSessions } from '../api';
import { DisconnectedBanner } from './OverviewPage';

const STATUS_BADGE = {
  delivered: 'bg-secondary/15 text-secondary border-secondary/30',
  queued: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function MessagesPage({ backendConnected }) {
  const [messages, setMessages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [toastMsg, setToastMsg] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const [m, a, s] = await Promise.all([fetchMessages(200), fetchAgents(), fetchSessions()]);
      setMessages(m.messages || []);
      setAgents(a.agents || []);
      setSessions(s.sessions || []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    if (!backendConnected) return;
    let active = true;

    const poll = async () => {
      try {
        const [m, a, s] = await Promise.all([fetchMessages(200), fetchAgents(), fetchSessions()]);
        if (!active) return;
        setMessages(m.messages || []);
        setAgents(a.agents || []);
        setSessions(s.sessions || []);
        setLoadError(null);
      } catch (e) {
        if (active) setLoadError(e.message || 'Failed to load messages');
      }
    };

    load();
    const id = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [backendConnected, load]);

  const agentNames = useMemo(() => {
    const ids = new Set(agents.map((a) => a.agent_id));
    messages.forEach((m) => {
      if (m.from_agent_id) ids.add(m.from_agent_id);
      if (m.to_agent_id) ids.add(m.to_agent_id);
    });
    return Array.from(ids).sort();
  }, [agents, messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (filterAgent !== 'all' && m.from_agent_id !== filterAgent && m.to_agent_id !== filterAgent) {
        return false;
      }
      if (filterStatus !== 'all' && (m.status || '').toLowerCase() !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [messages, filterAgent, filterStatus]);

  const handleExportCSV = useCallback(() => {
    if (!filteredMessages.length) {
      showToast('No messages available to export.');
      return;
    }
    const headers = ['Timestamp', 'Sender', 'Receiver', 'Status', 'Content'];
    const rows = filteredMessages.map((m) => [
      `"${m.timestamp || ''}"`,
      `"${m.from_agent_id || ''}"`,
      `"${m.to_agent_id || ''}"`,
      `"${m.status || ''}"`,
      `"${(m.content || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `netshield_messages_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredMessages.length} messages to CSV.`);
  }, [filteredMessages, showToast]);

  if (!backendConnected) {
    return <DisconnectedBanner />;
  }

  return (
    <div className="flex flex-col gap-4">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-surface-container-high border border-primary/50 px-3.5 py-2.5 rounded-lg shadow-2xl font-mono text-[12px] text-primary flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-error/40 bg-error-container/20 p-3 font-mono text-[12px] text-error">
          Failed to load messages: {loadError}
        </div>
      )}

      {/* ── Active Sessions ── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center gap-2 mb-2.5 border-b border-outline-variant/60 pb-2">
          <span className="material-symbols-outlined text-[18px] text-primary">hub</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Active Agent Sessions
          </span>
          <span className="ml-auto px-2 py-0.5 rounded bg-primary/15 text-primary font-mono text-[11px] font-semibold border border-primary/30">
            {sessions.length} total
          </span>
        </div>
        {sessions.length === 0 ? (
          <p className="font-mono text-[11px] text-outline px-1 py-2">
            No agent-to-agent sessions established yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-7 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                <th className="px-3 font-medium">Agent A</th>
                <th className="px-3 font-medium">Agent B</th>
                <th className="px-3 font-medium">Session Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 text-[12px] font-mono">
              {sessions.map((s, i) => (
                <tr key={i} className="h-7.5 hover:bg-surface-container-high/60 transition-colors">
                  <td className="px-3 text-on-surface">{s.agent_a_name}</td>
                  <td className="px-3 text-on-surface">{s.agent_b_name}</td>
                  <td className="px-3">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${
                      s.status === 'active'
                        ? 'bg-secondary/15 text-secondary border-secondary/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${s.status === 'active' ? 'bg-secondary' : 'bg-amber-400'}`} />
                      {s.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Message History ── */}
      <div className="flex flex-col bg-surface-container-low border border-outline-variant rounded-lg shadow-xs overflow-hidden">
        <div className="h-11 px-3.5 flex flex-wrap items-center justify-between border-b border-outline-variant bg-surface-container-lowest gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary">chat</span>
            <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">
              Inter-Agent Messages
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container text-outline font-mono text-[11px] font-semibold border border-outline-variant">
              {filteredMessages.length} shown / {messages.length} total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="h-7.5 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant text-[12px] font-mono focus:outline-none focus:border-primary"
            >
              <option value="all">All Agents</option>
              {agentNames.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-7.5 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant text-[12px] font-mono focus:outline-none focus:border-primary"
            >
              <option value="all">All Statuses</option>
              <option value="delivered">Delivered</option>
              <option value="queued">Queued</option>
            </select>

            <button
              onClick={handleExportCSV}
              className="h-7.5 px-2.5 rounded-lg bg-surface-container border border-outline-variant text-outline hover:text-on-surface active:scale-95 text-[12px] font-mono flex items-center gap-1.5 transition-all"
              title="Export CSV"
            >
              <span className="material-symbols-outlined text-[15px]">file_download</span>
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={load}
              className="h-7.5 w-7.5 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all"
              title="Refresh messages"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-7 bg-surface-container border-b border-outline-variant text-outline font-mono text-[11px] uppercase tracking-wider">
                <th className="px-3 font-medium w-28">Time</th>
                <th className="px-3 font-medium">Sender</th>
                <th className="px-3 font-medium">Receiver</th>
                <th className="px-3 font-medium">Message</th>
                <th className="px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 text-[12px]">
              {filteredMessages.map((m, idx) => (
                <tr key={m.id || idx} className="h-7.5 hover:bg-surface-container-high/60 transition-colors duration-150">
                  <td className="px-3 font-mono text-[11px] text-outline" title={m.timestamp}>
                    {timeAgo(m.timestamp) || m.timestamp || '—'}
                  </td>
                  <td className="px-3 font-mono text-[11px] text-on-surface font-medium">{m.from_agent_id || '—'}</td>
                  <td className="px-3 font-mono text-[11px] text-on-surface">{m.to_agent_id || '—'}</td>
                  <td className="px-3 text-on-surface-variant text-[11px] truncate max-w-[300px]">
                    {m.content || '—'}
                  </td>
                  <td className="px-3">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${
                      STATUS_BADGE[(m.status || '').toLowerCase()] ||
                      'bg-surface-container-high text-outline border-outline-variant'
                    }`}>
                      {(m.status || 'unknown').toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredMessages.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-outline font-mono text-[11px]">
                    {messages.length === 0
                      ? 'No inter-agent messages yet. They appear here as agents chat.'
                      : 'No messages match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * AgentControlPanel — agent connect/disconnect and probe ACK test.
 */
import { useState } from 'react';
import { connectAgent, disconnectAgent, sendAgentMessage } from '../api';

export default function AgentControlPanel({ isConnected, remoteDevice = {}, onRefresh, onToast, onProbeResult }) {
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [testPayload, setTestPayload] = useState('NETSHIELD_PROBE');
  const [msgResult, setMsgResult] = useState(null);
  const [agentActionError, setAgentActionError] = useState(null);

  const handleConnectLocal = async () => {
    setConnectLoading(true);
    setAgentActionError(null);
    try {
      const res = await connectAgent();
      if (res.success) {
        onToast?.(res.message || 'Test agent connected.');
        onRefresh?.();
      } else {
        setAgentActionError(res.error || 'Connection failed.');
        onToast?.(`Failed: ${res.error}`);
      }
    } catch (e) {
      setAgentActionError(e.message);
      onToast?.(`Error: ${e.message}`);
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnectLoading(true);
    setAgentActionError(null);
    try {
      const res = await disconnectAgent();
      if (res.success) {
        onToast?.('Agent disconnected.');
        setMsgResult(null);
        onProbeResult?.(false);
        onRefresh?.();
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`);
    } finally {
      setDisconnectLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!testPayload.trim()) return;

    setMsgLoading(true);
    setMsgResult(null);
    try {
      const res = await sendAgentMessage(testPayload.trim());
      setMsgResult(res);
      onProbeResult?.(!!res.success);
      if (res.success) {
        onToast?.(`ACK received in ${res.rtt_ms} ms.`);
      } else {
        onToast?.(`Probe failed: ${res.error}`);
      }
    } catch (err) {
      setMsgResult({ success: false, error: err.message });
      onProbeResult?.(false);
      onToast?.(`Network error: ${err.message}`);
    } finally {
      setMsgLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs flex flex-col gap-4">
      {/* ── Agent connect / disconnect ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">toggle_on</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Agent
            </span>
          </div>
          <div className="font-mono text-[12px] text-on-surface-variant mt-1.5">
            {isConnected
              ? `Connected: ${remoteDevice.hostname || remoteDevice.ip || 'active client'}`
              : 'No agent connected'}
          </div>
        </div>

        {!isConnected ? (
          <button
            onClick={handleConnectLocal}
            disabled={connectLoading}
            className="h-8 px-3.5 rounded-lg bg-primary/20 border border-primary/40 hover:bg-primary/30 text-primary font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            <span>{connectLoading ? 'Connecting...' : 'Start Local Test Agent'}</span>
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            disabled={disconnectLoading}
            className="h-8 px-3.5 rounded-lg bg-error-container/20 border border-error/40 hover:bg-error-container/30 text-error font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">stop</span>
            <span>{disconnectLoading ? 'Disconnecting...' : 'Disconnect'}</span>
          </button>
        )}
      </div>

      {agentActionError && (
        <div className="text-error text-[12px] font-mono flex items-center gap-1">
          <span className="material-symbols-outlined text-[15px]">error</span>
          <span>{agentActionError}</span>
        </div>
      )}

      {/* ── Probe test ── */}
      <div>
        <div className="flex items-center gap-2 mb-3 border-b border-outline-variant/60 pb-2.5">
          <span className="material-symbols-outlined text-[18px] text-secondary">mark_chat_read</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Probe test
          </span>
        </div>

        <form onSubmit={handleSendMessage} className="flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              disabled={!isConnected || msgLoading}
              placeholder="Probe message"
              className="flex-1 h-8 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!isConnected || msgLoading || !testPayload.trim()}
              className="h-8 px-4 rounded-lg bg-secondary/20 border border-secondary/40 hover:bg-secondary/30 text-secondary font-mono text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>{msgLoading ? 'Sending...' : 'Send probe'}</span>
            </button>
          </div>

          {msgResult &&
            (msgResult.success ? (
              <div className="flex items-center gap-1.5 font-mono text-[12px] text-secondary">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>ACK received in {msgResult.rtt_ms} ms</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-mono text-[12px] text-error">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                <span>{msgResult.error}</span>
              </div>
            ))}
        </form>
      </div>
    </div>
  );
}

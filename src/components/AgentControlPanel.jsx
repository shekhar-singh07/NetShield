/**
 * AgentControlPanel — Real agent lifecycle control and bidirectional message/ACK testing.
 * Measures monotonic round-trip time (RTT) and verifies live socket delivery.
 */
import { useState } from 'react';
import { connectAgent, disconnectAgent, sendAgentMessage } from '../api';

export default function AgentControlPanel({ isConnected, remoteDevice = {}, onRefresh, onToast }) {
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [testPayload, setTestPayload] = useState('NETSHIELD_PROBE_01');
  const [msgResult, setMsgResult] = useState(null);
  const [agentActionError, setAgentActionError] = useState(null);

  const handleConnectLocal = async () => {
    setConnectLoading(true);
    setAgentActionError(null);
    try {
      const res = await connectAgent();
      if (res.success) {
        onToast?.(res.message || 'Local test agent connected.');
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
      if (res.success) {
        onToast?.(`Real ACK received in ${res.rtt_ms} ms from ${res.recipient}`);
      } else {
        onToast?.(`Test failed: ${res.error}`);
      }
    } catch (err) {
      setMsgResult({ success: false, error: err.message });
      onToast?.(`Network error: ${err.message}`);
    } finally {
      setMsgLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 shadow-xs flex flex-col gap-4">
      {/* ── Section A: Agent Lifecycle Controls ── */}
      <div>
        <div className="flex items-center justify-between mb-3 border-b border-outline-variant/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">toggle_on</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Agent Control &amp; Connection Lifecycle
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold border ${
              isConnected
                ? 'bg-secondary/15 text-secondary border-secondary/30'
                : 'bg-surface-container text-outline border-outline-variant'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-secondary' : 'bg-outline'}`} />
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60">
          <div>
            <div className="text-[13px] font-medium text-on-surface">
              {isConnected
                ? `Connected Agent: ${remoteDevice.hostname || remoteDevice.ip || 'Active Client'}`
                : 'No Agent Connected'}
            </div>
            <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">
              {isConnected
                ? `Continuous heartbeat stream active on port ${remoteDevice.port || 5000}. Click disconnect to cleanly close socket.`
                : 'For single-machine testing, connect a local test agent instance, or run client.py on Computer A.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isConnected ? (
              <button
                onClick={handleConnectLocal}
                disabled={connectLoading}
                className="h-8 px-3.5 rounded-lg bg-primary/20 border border-primary/40 hover:bg-primary/30 text-primary font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                <span>{connectLoading ? 'Connecting...' : 'Start Local Test Agent'}</span>
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                disabled={disconnectLoading}
                className="h-8 px-3.5 rounded-lg bg-error-container/20 border border-error/40 hover:bg-error-container/30 text-error font-mono text-[12px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">stop</span>
                <span>{disconnectLoading ? 'Disconnecting...' : 'Disconnect Agent'}</span>
              </button>
            )}
          </div>
        </div>

        {agentActionError && (
          <div className="mt-2 text-error text-[12px] font-mono flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">error</span>
            <span>{agentActionError}</span>
          </div>
        )}
      </div>

      {/* ── Section B: Real Message & Acknowledgment Test (Monotonic RTT) ── */}
      <div>
        <div className="flex items-center justify-between mb-3 border-b border-outline-variant/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">mark_chat_read</span>
            <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
              Connection Verification &amp; Real ACK / RTT Test
            </span>
          </div>
          <span className="font-mono text-[11px] text-outline">
            Monotonic Clock Verification
          </span>
        </div>

        <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              disabled={!isConnected || msgLoading}
              placeholder="Enter probe message (e.g. NETSHIELD_PROBE)"
              className="flex-1 h-8 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!isConnected || msgLoading || !testPayload.trim()}
              className="h-8 px-4 rounded-lg bg-secondary/20 border border-secondary/40 hover:bg-secondary/30 text-secondary font-mono text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>{msgLoading ? 'Transmitting...' : 'Send Message Frame'}</span>
            </button>
          </div>

          {!isConnected && (
            <p className="text-[12px] text-outline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">info</span>
              <span>Connect an agent (via local test button or Computer A client) to test bidirectional TCP ACK delivery.</span>
            </p>
          )}

          {/* Test Results Banner */}
          {msgResult && (
            <div className={`p-3.5 rounded-lg border font-mono text-[12px] flex flex-col gap-2 ${
              msgResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-on-surface'
                : 'bg-error-container/20 border-error/40 text-error'
            }`}>
              <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">
                    {msgResult.success ? 'check_circle' : 'cancel'}
                  </span>
                  <span className="font-semibold text-[13px]">
                    {msgResult.success ? 'Bidirectional ACK Received' : 'Message Delivery Failed'}
                  </span>
                </div>
                {msgResult.rtt_ms != null && (
                  <span className="text-secondary font-bold text-[13px]">
                    RTT: {msgResult.rtt_ms} ms
                  </span>
                )}
              </div>

              {msgResult.success ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-on-surface-variant text-[11px] pt-1">
                  <div>Message ID: <span className="text-on-surface font-semibold">{msgResult.message_id}</span></div>
                  <div>Recipient: <span className="text-on-surface font-semibold">{msgResult.recipient}</span></div>
                  <div>Sent Content: <span className="text-primary font-semibold">"{msgResult.sent_message}"</span></div>
                  <div>ACK Content Echo: <span className="text-secondary font-semibold">"{msgResult.ack_content}"</span></div>
                  <div className="sm:col-span-2 text-outline text-[10px] mt-1 italic">
                    {msgResult.note}
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-error font-medium">
                  {msgResult.error}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

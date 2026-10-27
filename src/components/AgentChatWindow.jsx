import { useState, useRef, useEffect } from 'react';

export default function AgentChatWindow({
  selectedPeer = null,
  messages = [],
  currentAgentId = '',
  hasActiveSession = false,
  isQuarantined = false,
  onSendMessage,
  sendLoading = false,
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sendLoading || !hasActiveSession || isQuarantined) return;
    onSendMessage?.(selectedPeer.agent_id, trimmed);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!selectedPeer) {
    return (
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-8 shadow-xs flex flex-col items-center justify-center text-center h-full min-h-[380px]">
        <span className="material-symbols-outlined text-[42px] text-outline/50 mb-2">chat</span>
        <div className="font-mono text-[13px] font-semibold text-on-surface">No Peer Selected</div>
        <div className="font-mono text-[11px] text-outline max-w-xs mt-1">
          Select an agent from the network peer list to view the conversation or establish a session.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl shadow-xs flex flex-col h-full min-h-[420px]">
      {/* Header */}
      <div className="p-3.5 border-b border-outline-variant/60 flex items-center justify-between bg-surface-container/40 rounded-t-xl">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              selectedPeer.status === 'online' ? 'bg-secondary animate-pulse' : 'bg-outline'
            }`}
          />
          <div>
            <div className="font-mono text-[13px] font-bold text-on-surface flex items-center gap-2">
              <span>{selectedPeer.name || selectedPeer.agent_id}</span>
              <span className="text-[10px] text-outline font-normal px-1.5 py-0.2 rounded bg-surface-container">
                {selectedPeer.agent_id}
              </span>
            </div>
            <div className="font-mono text-[10px] text-outline">
              Status: {selectedPeer.status} •{' '}
              {hasActiveSession ? (
                <span className="text-secondary font-semibold">Active Session</span>
              ) : (
                <span className="text-amber-400">No Active Session</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Message history */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 min-h-[260px] max-h-[380px]">
        {messages.length === 0 ? (
          <div className="my-auto text-center text-outline font-mono text-[11px] py-8">
            No messages exchanged with {selectedPeer.name || selectedPeer.agent_id} yet.
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.from === currentAgentId || m.to !== currentAgentId;
            const timeStr = m.timestamp ? m.timestamp.split('T')[1]?.slice(0, 5) || m.timestamp.slice(0, 5) : '';

            return (
              <div
                key={m.id || idx}
                className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div
                  className={`px-3.5 py-2 rounded-2xl font-mono text-[12px] break-words ${
                    isMe
                      ? 'bg-primary/20 text-on-surface border border-primary/30 rounded-tr-xs'
                      : 'bg-surface-container-high text-on-surface border border-outline-variant/60 rounded-tl-xs'
                  }`}
                >
                  {m.text}
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[9px] text-outline px-1 mt-0.5">
                  <span>{timeStr}</span>
                  {isMe && (
                    <span className="uppercase font-semibold">
                      •{' '}
                      {m.status === 'delivered' ? (
                        <span className="text-secondary">Delivered</span>
                      ) : m.status === 'queued' ? (
                        <span className="text-amber-400">Queued</span>
                      ) : m.status === 'failed' ? (
                        <span className="text-error">Failed</span>
                      ) : (
                        <span>Sent</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-outline-variant/60 bg-surface-container/30 rounded-b-xl">
        {isQuarantined ? (
          <div className="py-2.5 px-3 rounded-lg bg-amber-500/15 border border-amber-500/40 font-mono text-[11px] text-amber-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-amber-400">gpp_bad</span>
            <span>Agent quarantined by NIDS. Outgoing messages and requests are temporarily isolated.</span>
          </div>
        ) : !hasActiveSession ? (
          <div className="py-2 px-3 rounded-lg bg-surface-container border border-outline-variant/40 font-mono text-[11px] text-amber-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">lock</span>
              <span>Session required to send messages. Connect first.</span>
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendLoading}
              placeholder="Type a message (Press Enter to send)..."
              className="flex-1 h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sendLoading}
              className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-mono text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">send</span>
              <span>{sendLoading ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

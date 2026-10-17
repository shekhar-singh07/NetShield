/**
 * CustomTrafficLab — Advanced Custom Traffic Testing Lab
 * Mode 1: Synthetic Detection Test (routes custom features through FlowAnalyzer & RandomForest ML).
 * Mode 2: Real Network Test (routes real frames over TCP socket to agent and awaits real ACK & RTT).
 */
import { useState } from 'react';
import { simulateCustomTraffic } from '../api';

const AVAILABLE_FLAGS = ['SYN', 'ACK', 'FIN', 'RST', 'PSH'];

export default function CustomTrafficLab({ onTestComplete, onToast }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState('detection_test'); // 'detection_test' | 'network_test'
  const [protocol, setProtocol] = useState('TCP');
  const [sourceIp, setSourceIp] = useState('192.168.1.105');
  const [destPort, setDestPort] = useState(80);
  const [packetCount, setPacketCount] = useState(25);
  const [selectedFlags, setSelectedFlags] = useState(['SYN']);
  const [payload, setPayload] = useState('CUSTOM_PROBE_VECTOR');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const toggleFlag = (flag) => {
    setSelectedFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const handleExecute = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setResult(null);

    const payloadObj = {
      mode,
      protocol,
      source_ip: sourceIp,
      destination_port: parseInt(destPort, 10) || 80,
      packet_count: parseInt(packetCount, 10) || 1,
      tcp_flags: selectedFlags,
      payload: payload || 'PROBE',
    };

    try {
      const res = await simulateCustomTraffic(payloadObj);
      setResult(res);
      if (res.success) {
        onTestComplete?.(res);
        if (mode === 'detection_test') {
          onToast?.(`Test completed: ${res.verdict} (${res.packets_evaluated} pkts)`);
        } else {
          onToast?.(`Real network frame acknowledged in ${res.rtt_ms} ms`);
        }
      } else {
        onToast?.(`Test failed: ${res.error}`);
      }
    } catch (err) {
      setResult({ success: false, error: err.message });
      onToast?.(`Execution error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs overflow-hidden">
      {/* Header */}
      <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">science</span>
          <span className="font-mono text-[13px] font-semibold text-on-surface uppercase tracking-wider">
            Custom Traffic &amp; Detection Lab
          </span>
          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px] font-semibold border border-outline-variant">
            DUAL-MODE TESTBED
          </span>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-outline hover:text-on-surface text-[12px] font-mono flex items-center gap-1 transition-colors"
        >
          <span>{isExpanded ? 'Collapse Lab' : 'Configure Custom Vectors'}</span>
          <span className="material-symbols-outlined text-[16px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 flex flex-col gap-4">
          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-3">
            <button
              onClick={() => { setMode('detection_test'); setResult(null); }}
              className={`px-3 py-1.5 rounded-lg font-mono text-[12px] font-semibold flex items-center gap-1.5 transition-all ${
                mode === 'detection_test'
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-surface-container text-outline hover:text-on-surface border border-outline-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              <span>Mode 1: Synthetic Detection Test (Pipeline Evaluation)</span>
            </button>

            <button
              onClick={() => { setMode('network_test'); setResult(null); }}
              className={`px-3 py-1.5 rounded-lg font-mono text-[12px] font-semibold flex items-center gap-1.5 transition-all ${
                mode === 'network_test'
                  ? 'bg-secondary/20 text-secondary border border-secondary/40'
                  : 'bg-surface-container text-outline hover:text-on-surface border border-outline-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">lan</span>
              <span>Mode 2: Real Network Test (Active Agent Channel)</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleExecute} className="flex flex-col gap-3.5">
            {mode === 'detection_test' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
                {/* Protocol */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-outline text-[11px]">Protocol</label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="TCP">TCP (Transmission Control)</option>
                    <option value="UDP">UDP (User Datagram)</option>
                    <option value="ICMP">ICMP (Ping / Control)</option>
                  </select>
                </div>

                {/* Source IP */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-outline text-[11px]">Simulated Source IPv4</label>
                  <input
                    type="text"
                    value={sourceIp}
                    onChange={(e) => setSourceIp(e.target.value)}
                    placeholder="192.168.1.105"
                    className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Target Port */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-outline text-[11px]">Destination Port</label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={destPort}
                    onChange={(e) => setDestPort(e.target.value)}
                    className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Packet Count */}
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-outline text-[11px]">Packet Volume (1-500)</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={packetCount}
                    onChange={(e) => setPacketCount(e.target.value)}
                    className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* TCP Flags */}
                {protocol === 'TCP' && (
                  <div className="sm:col-span-2 flex flex-col gap-1">
                    <label className="font-mono text-outline text-[11px]">TCP Control Flags</label>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {AVAILABLE_FLAGS.map((f) => {
                        const active = selectedFlags.includes(f);
                        return (
                          <button
                            type="button"
                            key={f}
                            onClick={() => toggleFlag(f)}
                            className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold border transition-all ${
                              active
                                ? 'bg-primary/20 text-primary border-primary/40'
                                : 'bg-surface-container text-outline border-outline-variant'
                            }`}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payload */}
                <div className={protocol === 'TCP' ? 'sm:col-span-2 flex flex-col gap-1' : 'sm:col-span-4 flex flex-col gap-1'}>
                  <label className="font-mono text-outline text-[11px]">Payload / Signature String</label>
                  <input
                    type="text"
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    placeholder="CUSTOM_PAYLOAD_STRING"
                    className="h-8 px-2.5 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/60 flex flex-col gap-2.5 text-[12px]">
                <div className="flex items-center gap-2 text-on-surface font-semibold">
                  <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
                  <span>Real Network Frame Transmission (Port 5000 Channel)</span>
                </div>
                <p className="text-on-surface-variant text-[12px] leading-relaxed">
                  Transmits an actual message frame over the authenticated bidirectional TCP channel to Computer A.
                  Monitors round-trip delivery time and verifies agent receiver responsiveness.
                </p>
                <div className="flex flex-col gap-1 mt-1">
                  <label className="font-mono text-outline text-[11px]">Transmission Payload</label>
                  <input
                    type="text"
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    placeholder="NET_TEST_MESSAGE"
                    className="h-8 px-2.5 rounded bg-surface-container border border-outline-variant font-mono text-[12px] text-on-surface focus:outline-none focus:border-primary max-w-md"
                  />
                </div>
              </div>
            )}

            {/* Execute Button */}
            <div className="flex items-center justify-between pt-1">
              <div className="font-mono text-[11px] text-outline">
                {mode === 'detection_test'
                  ? 'Offline synthetic vector — Safe for live production environments.'
                  : 'Real socket transmission — Requires active Computer A agent link.'}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-9 px-5 rounded-lg bg-primary/20 border border-primary/40 hover:bg-primary/30 text-primary font-mono text-[13px] font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {loading ? 'hourglass_top' : 'bolt'}
                </span>
                <span>{loading ? 'Processing Vector...' : mode === 'detection_test' ? 'Inject Test Vector' : 'Transmit Network Frame'}</span>
              </button>
            </div>
          </form>

          {/* Results Display */}
          {result && (
            <div className={`p-4 rounded-lg border font-mono text-[12px] flex flex-col gap-2 ${
              result.success
                ? result.threat_detected
                  ? 'bg-error-container/20 border-error/40 text-on-surface'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-on-surface'
                : 'bg-error-container/20 border-error/40 text-error'
            }`}>
              <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[20px] ${
                    result.threat_detected ? 'text-error' : result.success ? 'text-emerald-400' : 'text-error'
                  }`}>
                    {result.threat_detected ? 'warning' : result.success ? 'check_circle' : 'error'}
                  </span>
                  <span className="font-bold text-[14px]">
                    {result.success ? result.verdict || result.message : 'Execution Failed'}
                  </span>
                </div>

                {result.rtt_ms != null && (
                  <span className="text-secondary font-bold">
                    RTT: {result.rtt_ms} ms
                  </span>
                )}
              </div>

              {result.success ? (
                <div className="flex flex-col gap-1.5 text-on-surface-variant text-[12px] pt-1">
                  <div>Summary: <span className="text-on-surface">{result.summary || result.message}</span></div>
                  {result.events_triggered && result.events_triggered.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-outline">Triggered Signatures:</span>
                      {result.events_triggered.map((ev, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-error-container/40 text-error border border-error-container font-semibold text-[11px]">
                          {ev.type || ev}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.note && (
                    <div className="text-outline text-[11px] mt-1 italic">{result.note}</div>
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-error font-medium">{result.error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

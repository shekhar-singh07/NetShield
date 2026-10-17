/**
 * ProtocolDistribution — Visual breakdown of network protocols observed in live traffic.
 * Takes real `protocols` data from backend metrics ({ tcp, udp, icmp, other }).
 */
import { useEffect, useRef, useMemo } from 'react';

export default function ProtocolDistribution({ protocols = {} }) {
  const barsRef = useRef([]);

  const tcpPct = protocols.tcp ?? 0;
  const udpPct = protocols.udp ?? 0;
  const icmpPct = protocols.icmp ?? 0;
  const otherPct = Math.max(0, 100 - (tcpPct + udpPct + icmpPct));

  const items = useMemo(() => [
    { name: 'TCP', pct: tcpPct, colorBar: 'bg-primary', colorText: 'text-primary' },
    { name: 'UDP', pct: udpPct, colorBar: 'bg-secondary', colorText: 'text-secondary' },
    { name: 'ICMP', pct: icmpPct, colorBar: 'bg-tertiary-container', colorText: 'text-tertiary-fixed-dim' },
    { name: 'Other / Raw', pct: otherPct, colorBar: 'bg-outline', colorText: 'text-outline' },
  ], [tcpPct, udpPct, icmpPct, otherPct]);

  useEffect(() => {
    items.forEach((item, i) => {
      if (barsRef.current[i]) {
        barsRef.current[i].style.width = `${item.pct}%`;
      }
    });
  }, [items]);

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg flex flex-col shadow-xs h-full">
      {/* Header */}
      <div className="h-10 px-3.5 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest rounded-t-lg">
        <span className="text-[13px] font-semibold text-on-surface uppercase tracking-wider font-mono">
          Protocol Distribution
        </span>
        <span className="font-mono text-[11px] text-outline">Active Window</span>
      </div>

      {/* Bars */}
      <div className="p-3.5 flex flex-col justify-around gap-2.5 flex-1">
        {items.map((proto, i) => (
          <div key={proto.name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between font-mono text-[12px]">
              <span className={`font-semibold ${proto.colorText}`}>
                {proto.name}
              </span>
              <span className="text-on-surface font-semibold">
                {proto.pct}%
              </span>
            </div>
            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                ref={(el) => (barsRef.current[i] = el)}
                className={`h-full ${proto.colorBar} transition-all duration-500 ease-out`}
                style={{ width: `${proto.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

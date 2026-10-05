import { useEffect, useRef } from 'react';

const PROTOCOLS = [
  { name: 'TCP', pct: 56, bytes: '1.4 GB', colorBar: 'bg-primary', colorText: 'text-primary' },
  { name: 'UDP', pct: 26, bytes: '648 MB', colorBar: 'bg-secondary', colorText: 'text-secondary' },
  { name: 'ICMP', pct: 8, bytes: '198 MB', colorBar: 'bg-tertiary-container', colorText: 'text-tertiary-fixed-dim' },
  { name: 'Other / Encapsulated', pct: 10, bytes: '245 MB', colorBar: 'bg-outline', colorText: 'text-outline' },
];

/**
 * ProtocolDistribution — horizontal progress bars for TCP, UDP, ICMP, Other.
 */
export default function ProtocolDistribution({ data }) {
  const barsRef = useRef([]);

  // Animate bar widths on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      barsRef.current.forEach((el, i) => {
        if (el) el.style.width = `${PROTOCOLS[i].pct}%`;
      });
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded flex flex-col">
      {/* Header */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <span className="text-[13px] font-semibold text-on-surface leading-[18px]">Protocol Distribution</span>
        <span className="font-mono text-[11px] text-outline">Window: Last 15m</span>
      </div>

      {/* Bars */}
      <div className="p-2 flex flex-col gap-1.5">
        {PROTOCOLS.map((proto, i) => (
          <div
            key={proto.name}
            className="flex flex-col gap-1 p-1 rounded hover:bg-surface-container-high/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className={`font-medium text-on-surface group-hover:${proto.colorText} transition-colors`}>
                {proto.name}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-outline font-mono text-[11px] group-hover:text-on-surface">{proto.bytes}</span>
                <span className={`${proto.colorText} font-semibold font-mono text-[11px] w-8 text-right`}>
                  {proto.pct}%
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                ref={el => barsRef.current[i] = el}
                className={`h-full ${proto.colorBar} transition-all duration-700 ease-out`}
                style={{ width: '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

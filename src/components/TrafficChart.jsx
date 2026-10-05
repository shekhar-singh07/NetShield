import { useState, useRef, useMemo, useCallback } from 'react';

/* ── SVG chart layout constants ── */
const VB_W = 1000;
const VB_H = 180;
const CL = 55;   // chart left
const CR = 995;  // chart right
const CT = 15;   // chart top
const CB = 155;  // chart bottom
const CW = CR - CL;
const CH = CB - CT;
const MAX_Y = 10; // MB/s

const Y_TICKS = [0, 2.5, 5.0, 7.5, 10.0];
const X_GRID = [CL + 5, CL + CW * 0.25, CL + CW * 0.5, CL + CW * 0.75, CR - 15];

/** Map a data value to SVG Y coordinate */
const toY = (v) => CB - (Math.min(v, MAX_Y) / MAX_Y) * CH;
/** Map a data index to SVG X coordinate */
const toX = (i, n) => CL + (i / Math.max(n - 1, 1)) * CW;

/** Build a polygon points string (area fill) */
function areaPoints(pts) {
  if (!pts.length) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${first.x},${CB} ${pts.map(p => `${p.x},${p.y}`).join(' ')} ${last.x},${CB}`;
}

/** Build a polyline points string (stroke trace) */
function linePoints(pts) {
  return pts.map(p => `${p.x},${p.y}`).join(' ');
}

/**
 * TrafficChart — SVG-based traffic visualization with interactive crosshair.
 */
export default function TrafficChart({ data, isMonitoring, onToast }) {
  const [timeWindow, setTimeWindow] = useState('live');
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  // Compute SVG coordinates from data
  const { rxPts, txPts, xLabels } = useMemo(() => {
    const n = data.length;
    const rx = data.map((d, i) => ({ x: toX(i, n), y: toY(d.rxMbps) }));
    const tx = data.map((d, i) => ({ x: toX(i, n), y: toY(d.txMbps) }));
    // Pick ~5 evenly spaced labels
    const labelIdxs = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
    const labels = labelIdxs.map(i => ({ x: toX(i, n), label: data[i]?.time ?? '' }));
    return { rxPts: rx, txPts: tx, xLabels: labels };
  }, [data]);

  // Find closest data point on mouse move
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current || !data.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width) * VB_W;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < rxPts.length; i++) {
      const dist = Math.abs(rxPts[i].x - normX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    setHoverIdx(closest);
  }, [rxPts, data.length]);

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null);
  }, []);

  // Active hover index (fallback to last point)
  const activeIdx = hoverIdx ?? (data.length - 1);
  const activeData = data[activeIdx];
  const activeRx = rxPts[activeIdx];
  const activeTx = txPts[activeIdx];

  const handleTimeSwitch = (w) => {
    setTimeWindow(w);
    onToast?.(`Time window switched to: ${w === 'live' ? 'Live' : w}`);
  };

  return (
    <div className="flex flex-col">
      {/* ── Panel Header ── */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-on-surface flex items-center gap-1.5 leading-[18px]">
            <span className="material-symbols-outlined text-outline text-[16px]">show_chart</span>
            Network Traffic
          </span>
          <span className="text-outline-variant">|</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-primary inline-block" />
              <span className="font-mono text-[11px] text-on-surface-variant">Incoming (eth0 RX)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-secondary inline-block" />
              <span className="font-mono text-[11px] text-on-surface-variant">Outgoing (eth0 TX)</span>
            </div>
          </div>
        </div>

        {/* Time selector */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-surface-container-high rounded p-0.5 border border-outline-variant">
            {['live', '5m', '15m'].map((w) => (
              <button
                key={w}
                onClick={() => handleTimeSwitch(w)}
                className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-medium leading-none flex items-center gap-1 transition-all duration-150 ${
                  timeWindow === w
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {w === 'live' && timeWindow === 'live' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-950 animate-ping inline-block" />
                )}
                {w === 'live' ? 'Live' : w === '5m' ? '5 min' : '15 min'}
              </button>
            ))}
          </div>
          <button className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface active:scale-90 transition-all" title="Panel Options">
            <span className="material-symbols-outlined text-[14px]">more_vert</span>
          </button>
        </div>
      </div>

      {/* ── Chart Body ── */}
      <div
        className="p-2 bg-surface-container-lowest relative cursor-crosshair overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="w-full h-48 select-none">
          <svg
            ref={svgRef}
            className="w-full h-full overflow-visible"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
          >
            {/* Horizontal grid lines */}
            <g className="text-outline-variant stroke-current opacity-70" strokeDasharray="2,2" strokeWidth="0.75">
              {Y_TICKS.map((_, i) => {
                const y = CT + (i / (Y_TICKS.length - 1)) * CH;
                return <line key={i} x1={CL} x2={CR} y1={y} y2={y} />;
              })}
            </g>

            {/* Y-axis labels */}
            <g className="fill-current text-outline" textAnchor="end">
              {Y_TICKS.slice().reverse().map((v, i) => {
                const y = CT + (i / (Y_TICKS.length - 1)) * CH + 4;
                return <text key={v} x={48} y={y} className="text-[10px]">{v.toFixed(1)} MB/s</text>;
              })}
            </g>

            {/* Vertical grid lines */}
            <g className="text-outline-variant stroke-current opacity-70" strokeDasharray="2,2" strokeWidth="0.75">
              {X_GRID.map((x, i) => <line key={i} x1={x} x2={x} y1={CT} y2={CB} />)}
            </g>

            {/* RX area + line (primary / blue) */}
            {rxPts.length > 1 && (
              <>
                <polygon className="fill-primary/10 transition-all duration-300" points={areaPoints(rxPts)} />
                <polyline className="stroke-primary" fill="none" points={linePoints(rxPts)} strokeLinejoin="round" strokeWidth="1.5" />
              </>
            )}

            {/* TX area + line (secondary / cyan) */}
            {txPts.length > 1 && (
              <>
                <polygon className="fill-secondary/10 transition-all duration-300" points={areaPoints(txPts)} />
                <polyline className="stroke-secondary" fill="none" points={linePoints(txPts)} strokeLinejoin="round" strokeWidth="1.5" />
              </>
            )}

            {/* Interactive crosshair */}
            {activeRx && activeTx && (
              <g>
                <line
                  className="stroke-outline/80 transition-transform duration-75"
                  strokeDasharray="3,3"
                  strokeWidth="1"
                  x1={activeRx.x} x2={activeRx.x}
                  y1={CT} y2={CB}
                />
                <circle className="fill-surface stroke-primary transition-all duration-75" cx={activeRx.x} cy={activeRx.y} r="3.5" strokeWidth="2" />
                <circle className="fill-surface stroke-secondary transition-all duration-75" cx={activeTx.x} cy={activeTx.y} r="3.5" strokeWidth="2" />
              </g>
            )}

            {/* X-axis timestamps */}
            <g className="fill-current text-outline" textAnchor="middle">
              {xLabels.map((lbl, i) => (
                <text key={i} x={lbl.x} y={172} className="text-[10px]">
                  {lbl.label}{i === xLabels.length - 1 && isMonitoring ? ' (Live)' : ''}
                </text>
              ))}
            </g>
          </svg>
        </div>

        {/* Tooltip overlay */}
        {activeData && (
          <div
            className="absolute top-4 bg-surface-container-high/95 backdrop-blur-sm border border-outline-variant px-1.5 py-1.5 rounded text-left pointer-events-none flex flex-col gap-0.5 shadow-lg transition-transform duration-75"
            style={activeRx && activeRx.x > VB_W * 0.7
              ? { left: '4rem', right: 'auto' }
              : { right: '3.5rem', left: 'auto' }
            }
          >
            <div className="font-mono text-[10px] text-outline border-b border-outline-variant/50 pb-0.5">
              {activeData.time} UTC
            </div>
            <div className="font-mono text-[11px] text-primary flex items-center justify-between gap-3">
              <span>RX:</span>
              <span className="font-semibold">{activeData.rxMbps.toFixed(2)} MB/s</span>
            </div>
            <div className="font-mono text-[11px] text-secondary flex items-center justify-between gap-3">
              <span>TX:</span>
              <span className="font-semibold">{activeData.txMbps.toFixed(2)} MB/s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

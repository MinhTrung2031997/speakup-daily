export interface Bar { label: string; value: number; title?: string }

/** Tiny dependency-free SVG bar chart. */
export default function BarChart({ data, color = 'fill-blue-500', unit = '' }: { data: Bar[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="h-36 w-full">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={100} y1={50 - g * 46} y2={50 - g * 46} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={0.2} />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * 46;
          return (
            <rect key={i} x={i * w + w * 0.18} y={50 - h} width={w * 0.64} height={Math.max(h, d.value ? 0.8 : 0.3)} rx={0.8} className={d.value ? color : 'fill-slate-200 dark:fill-slate-800'}>
              <title>{d.title || `${d.label}: ${d.value}${unit}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-slate-400">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

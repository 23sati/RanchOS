'use client';

type MapLegendEntry = {
  label: string;
  fillColor?: string;
  borderColor?: string;
  dashed?: boolean;
  marker?: boolean;
};

type MapLegendProps = {
  entries: MapLegendEntry[];
  title?: string;
  className?: string;
};

function buildWrapperClassName(className?: string) {
  const baseClassName = 'pointer-events-none absolute z-10 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur';
  return className ? `${baseClassName} ${className}` : baseClassName;
}

export default function MapLegend({
  entries,
  title = 'Map legend',
  className,
}: MapLegendProps) {
  if (!entries.length) {
    return null;
  }

  return (
    <div className={buildWrapperClassName(className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2 text-xs font-medium text-stone-700">
            <span
              className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${entry.marker ? 'rounded-full' : ''}`}
              style={{
                backgroundColor: entry.fillColor ?? 'transparent',
                borderColor: entry.borderColor ?? entry.fillColor ?? '#57534E',
                borderStyle: entry.dashed ? 'dashed' : 'solid',
                borderWidth: entry.marker ? '2px' : '1px',
              }}
            >
              {entry.marker ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
            </span>
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

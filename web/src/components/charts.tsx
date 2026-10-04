"use client";
// Inline-SVG charts for S10, following the dataviz skill: thin marks, 2px lines, 4px rounded data
// ends, 2px surface gaps between stacked fills, recessive grid, hover tooltips, legend for 2+ series.
import * as React from "react";
import { cn } from "@/lib/cn";

const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / step) * step;
  // Even maximum, so the middle gridline is a whole number for counts.
  return n % 2 ? n + step : n;
}
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(600);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Axes({ w, max, labels }: { w: number; max: number; labels: { x: number; text: string }[] }) {
  const ticks = [0, max / 2, max];
  const plotH = H - PAD.top - PAD.bottom;
  return (
    <g aria-hidden>
      {ticks.map((t) => {
        const y = PAD.top + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y} stroke="var(--c-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y} dy="0.32em" textAnchor="end" className="fill-[var(--c-text-muted)] text-[11px] tabular-nums">{t}</text>
          </g>
        );
      })}
      {labels.map((l) => (
        <text key={l.x} x={l.x} y={H - 6} textAnchor="middle" className="fill-[var(--c-text-muted)] text-[11px]">{l.text}</text>
      ))}
    </g>
  );
}

function Tooltip({ x, w, children }: { x: number; w: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x - 80, 0), w - 160);
  return (
    <div role="status" className="pointer-events-none absolute top-2 z-10 w-40 rounded-md border bg-bg px-2.5 py-1.5 text-sm shadow-pop" style={{ left }}>
      {children}
    </div>
  );
}

function labelEvery(n: number, w: number) {
  return Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - PAD.left - PAD.right) / 70))));
}

/** One series over time: area + 2px line, crosshair tooltip. The title names the series, so no legend. */
export function DailyLine({ data, label }: { data: { date: string; value: number }[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const plotW = w - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const every = labelEvery(data.length, w);
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`${label}: ${total} in total over ${data.length} days. Exact numbers are in the table view.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - PAD.left) / plotW) * (data.length - 1));
          setHover(Math.min(Math.max(i, 0), data.length - 1));
        }}
      >
        <Axes w={w} max={max} labels={data.map((d, i) => ({ x: x(i), text: dayLabel(d.date) })).filter((_, i) => i % every === 0)} />
        <path d={area} fill="var(--c-chart-1)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--c-chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g aria-hidden>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--c-border-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={4} fill="var(--c-chart-1)" stroke="var(--c-bg)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} w={w}>
          <span className="block text-xs text-muted">{dayLabel(data[hover].date)}</span>
          <span className="font-medium tabular-nums text-fg">{data[hover].value}</span> <span className="text-muted">{label.toLowerCase()}</span>
        </Tooltip>
      )}
    </div>
  );
}

export type StackSeries<K extends string> = { key: K; label: string; color: string }[];

/** Stacked bars per day, first series at the baseline. 2px surface gaps, 4px rounded top. */
export function StackedBars<K extends string>({ data, series, label }: { data: ({ date: string } & Record<K, number>)[]; series: StackSeries<K>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const totals = data.map((d) => series.reduce((n, s) => n + d[s.key], 0));
  const max = niceMax(Math.max(...totals, 1));
  const plotW = w - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const bw = Math.max(3, Math.min(18, slot - 3));
  const every = labelEvery(data.length, w);
  const grand = totals.reduce((a, b) => a + b, 0);

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <ul className="mb-2 flex flex-wrap gap-4 text-sm text-muted" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} aria-hidden /> {s.label}
          </li>
        ))}
      </ul>
      <svg width={w} height={H} role="img" aria-label={`${label}: ${grand} in total over ${data.length} days. Exact numbers are in the table view.`} onMouseLeave={() => setHover(null)}>
        <Axes w={w} max={max} labels={data.map((d, i) => ({ x: PAD.left + slot * (i + 0.5), text: dayLabel(d.date) })).filter((_, i) => i % every === 0)} />
        {data.map((d, i) => {
          const cx = PAD.left + slot * (i + 0.5);
          let base = PAD.top + plotH;
          const visible = series.filter((s) => d[s.key] > 0);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.55}>
              {/* Hit target wider than the bar. */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {visible.map((s, k) => {
                const h = (d[s.key] / max) * plotH;
                const top = base - h;
                const gap = k < visible.length - 1 ? 2 : 0;
                const isTop = k === visible.length - 1;
                const r = Math.min(4, bw / 2, h / 2);
                const path = isTop
                  ? `M${cx - bw / 2},${base}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${base}Z`
                  : `M${cx - bw / 2},${base}V${top + gap}H${cx + bw / 2}V${base}Z`;
                base = top;
                return <path key={s.key} d={path} fill={s.color} />;
              })}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.left + slot * (hover + 0.5)} w={w}>
          <span className="block text-xs text-muted">{dayLabel(data[hover].date)}</span>
          {[...series].reverse().map((s) => (
            <span key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />{s.label}</span>
              <span className="tabular-nums text-fg">{data[hover][s.key]}</span>
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function ChartCard({ title, description, table, children, className }: { title: string; description?: string; table: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [asTable, setAsTable] = React.useState(false);
  return (
    <section className={cn("min-w-0 rounded-lg border bg-bg p-4 shadow-card", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-md font-semibold text-fg">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
          className="rounded-sm text-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      {asTable ? <div tabIndex={0} className="max-h-64 overflow-auto rounded-md border focus-visible:outline-2 focus-visible:outline-focus">{table}</div> : children}
    </section>
  );
}

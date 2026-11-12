import type { ReactNode } from 'react';
import { formatMetricValue, formatTick } from '@/features/experiments/lib/format-metric';
import { niceScale } from '@/features/experiments/lib/nice-scale';
import type { Summary } from '@/features/experiments/lib/summarize';

/** One configuration's row: every run as a point, its median as a tick. */
export interface DotPlotRow {
  key: string;
  name: string;
  color: string;
  points: { key: string; value: number; title: string }[];
  summary: Summary;
}

interface RunDotPlotProps {
  title: string;
  unit: string;
  better: 'lower' | 'higher';
  description: string;
  rows: DotPlotRow[];
}

// Geometry in viewBox units; the SVG scales to its container's width.
const WIDTH = 360;
const PLOT_LEFT = 8;
const LABEL_WIDTH = 64;
const PLOT_RIGHT = WIDTH - LABEL_WIDTH - 8;
const ROW_HEIGHT = 28;
const TOP = 4;
const AXIS_HEIGHT = 22;
const DOT_RADIUS = 4;
/** Transparent circle around each dot: the hover target is bigger than the mark. */
const HIT_RADIUS = 12;
const MEDIAN_HALF_HEIGHT = 9;

/**
 * Dot plot of one metric across the configurations of a workload, rendered on the server as
 * SVG (ADR 015): no JavaScript reaches the browser. Each run is a dot so the spread stays
 * visible (five runs are too few for a box plot), the median is a vertical tick, and the
 * median's value is printed at the end of the row. Hovering a dot shows its run (`<title>`);
 * the same numbers are in the table below the charts.
 */
export function RunDotPlot({ title, unit, better, description, rows }: RunDotPlotProps): ReactNode {
  const largest = Math.max(...rows.flatMap((row) => row.points.map((point) => point.value)));
  const scale = niceScale(largest);
  const x = (value: number): number => PLOT_LEFT + (value / scale.max) * (PLOT_RIGHT - PLOT_LEFT);
  const plotBottom = TOP + rows.length * ROW_HEIGHT;
  const height = plotBottom + AXIS_HEIGHT;
  const summaryText = rows
    .map((row) => `${row.name}: median ${formatMetricValue(row.summary.median)} ${unit}`)
    .join('; ');

  return (
    <figure className="space-y-2">
      <figcaption>
        <span className="text-sm font-medium text-neutral-100">{title}</span>
        <span className="text-xs text-neutral-400">
          {' '}
          · {unit}, {better} is better
        </span>
        <span className="block text-xs text-neutral-500">{description}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}. ${summaryText}.`}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={TOP}
              y2={plotBottom}
              style={{ stroke: tick === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)' }}
              strokeWidth={1}
            />
            <text
              x={x(tick)}
              y={plotBottom + 15}
              textAnchor="middle"
              fontSize={10}
              style={{ fill: 'var(--chart-muted)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const centre = TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;

          return (
            <g key={row.key}>
              {row.points.map((point) => (
                <g key={point.key} className="group">
                  <title>{point.title}</title>
                  <circle cx={x(point.value)} cy={centre} r={HIT_RADIUS} fill="transparent" />
                  <circle
                    cx={x(point.value)}
                    cy={centre}
                    r={DOT_RADIUS}
                    className="transition-opacity group-hover:opacity-70"
                    style={{ fill: row.color, stroke: 'var(--chart-surface)' }}
                    strokeWidth={2}
                  />
                </g>
              ))}
              <line
                x1={x(row.summary.median)}
                x2={x(row.summary.median)}
                y1={centre - MEDIAN_HALF_HEIGHT}
                y2={centre + MEDIAN_HALF_HEIGHT}
                style={{ stroke: 'var(--chart-ink)' }}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <text
                x={WIDTH - 4}
                y={centre + 4}
                textAnchor="end"
                fontSize={11}
                style={{ fill: 'var(--chart-ink-secondary)', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMetricValue(row.summary.median)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

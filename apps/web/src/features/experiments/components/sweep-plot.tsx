import type { ReactNode } from 'react';
import { formatMetricValue, formatTick } from '@/features/experiments/lib/format-metric';
import { niceScale } from '@/features/experiments/lib/nice-scale';
import type { Summary } from '@/features/experiments/lib/summarize';

/** One value of the swept option: its runs and their median. */
export interface SweepStep {
  key: string;
  /** The option's value, printed under the axis ("4"). */
  label: string;
  points: { key: string; value: number; title: string }[];
  summary: Summary;
}

interface SweepPlotProps {
  title: string;
  unit: string;
  better: 'lower' | 'higher';
  description: string;
  /** What the x axis counts ("uploaders"). */
  axisLabel: string;
  steps: SweepStep[];
}

// Geometry in viewBox units; the SVG scales to its container's width.
const WIDTH = 360;
const HEIGHT = 190;
const LEFT = 40;
const RIGHT = WIDTH - 12;
const TOP = 16;
const BOTTOM = HEIGHT - 36;
const DOT_RADIUS = 4;
const HIT_RADIUS = 12;
/** Runs of one step are spread sideways a little so equal values don't hide each other. */
const SPREAD = 5;
const COLOR = 'var(--chart-series-1)';

/**
 * One metric across the values of a single swept option (ADR 015: server-rendered SVG). Steps
 * are evenly spaced and labelled with their value: the sweep doubles (1, 2, 4, 8), so even
 * spacing reads like a log scale. Every run is a dot, a line joins the medians, and only the
 * best median is printed, above its dots (the rest are in the table and on hover).
 */
export function SweepPlot({
  title,
  unit,
  better,
  description,
  axisLabel,
  steps,
}: SweepPlotProps): ReactNode {
  const largest = Math.max(...steps.flatMap((step) => step.points.map((point) => point.value)));
  const scale = niceScale(largest);
  const band = (RIGHT - LEFT) / steps.length;
  const x = (index: number): number => LEFT + band * (index + 0.5);
  const y = (value: number): number => BOTTOM - (value / scale.max) * (BOTTOM - TOP);
  const medians = steps.map((step) => step.summary.median);
  const best = better === 'higher' ? Math.max(...medians) : Math.min(...medians);
  const bestIndex = medians.indexOf(best);
  const summaryText = steps
    .map(
      (step) =>
        `${step.label} ${axisLabel}: median ${formatMetricValue(step.summary.median)} ${unit}`,
    )
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
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title} by ${axisLabel}. ${summaryText}.`}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              style={{ stroke: tick === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)' }}
              strokeWidth={1}
            />
            <text
              x={LEFT - 6}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize={10}
              style={{ fill: 'var(--chart-muted)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        <polyline
          points={medians
            .map((median, index) => `${String(x(index))},${String(y(median))}`)
            .join(' ')}
          fill="none"
          style={{ stroke: COLOR }}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {steps.map((step, index) => (
          <g key={step.key}>
            {step.points.map((point, pointIndex) => {
              const cx = x(index) + (pointIndex - (step.points.length - 1) / 2) * SPREAD;

              return (
                <g key={point.key} className="group">
                  <title>{point.title}</title>
                  <circle cx={cx} cy={y(point.value)} r={HIT_RADIUS} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={y(point.value)}
                    r={DOT_RADIUS}
                    className="transition-opacity group-hover:opacity-70"
                    style={{
                      fill: COLOR,
                      stroke: 'var(--chart-surface)',
                      opacity: 0.55,
                    }}
                    strokeWidth={2}
                  />
                </g>
              );
            })}
            <rect
              x={x(index) - 8}
              y={y(step.summary.median) - 1}
              width={16}
              height={2}
              rx={1}
              style={{ fill: 'var(--chart-ink)' }}
            >
              <title>{`${step.label} ${axisLabel}: median ${formatMetricValue(step.summary.median)} ${unit}`}</title>
            </rect>
            {index === bestIndex && (
              <text
                x={x(index)}
                // Above the step's highest dot, so the label never sits on a mark.
                y={y(step.summary.max) - DOT_RADIUS - 6}
                textAnchor="middle"
                fontSize={11}
                style={{ fill: 'var(--chart-ink)', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMetricValue(step.summary.median)}
              </text>
            )}
            <text
              x={x(index)}
              y={BOTTOM + 15}
              textAnchor="middle"
              fontSize={10}
              style={{ fill: 'var(--chart-ink-secondary)', fontVariantNumeric: 'tabular-nums' }}
            >
              {step.label}
            </text>
          </g>
        ))}
        <text
          x={(LEFT + RIGHT) / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          fontSize={10}
          style={{ fill: 'var(--chart-muted)' }}
        >
          {axisLabel}
        </text>
      </svg>
    </figure>
  );
}

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkloadSection } from '@/features/experiments/components/workload-section';
import { buildBenchmarkRun as run } from '@/features/experiments/lib/benchmark-run.fixture';
import { groupRuns } from '@/features/experiments/lib/group-runs';

function renderComparison(): void {
  const [workload] = groupRuns([
    run({ startedAt: '2026-11-12T20:00:01Z', wallMs: 762 }),
    run({
      startedAt: '2026-11-12T20:00:02Z',
      wallMs: 786,
      options: { packInWorkers: true },
    }),
    run({ startedAt: '2026-11-12T20:00:03Z', wallMs: 811 }),
    run({
      startedAt: '2026-11-12T20:00:04Z',
      wallMs: 965,
      options: { packInWorkers: true },
    }),
    run({ startedAt: '2026-11-12T20:00:05Z', wallMs: 786 }),
    run({
      startedAt: '2026-11-12T20:00:06Z',
      wallMs: 997,
      options: { packInWorkers: true },
    }),
  ]);

  if (workload === undefined) {
    throw new Error('expected one workload');
  }

  render(<WorkloadSection workload={workload} />);
}

describe('WorkloadSection', () => {
  it('says what is compared and what stays the same', () => {
    renderComparison();

    expect(
      screen.getByRole('heading', { name: 'Import · 1k textures · first 50 models' }),
    ).toBeDefined();
    expect(screen.getByText('where packing runs')).toBeDefined();
    expect(
      screen.getByText(/the same in every run: 2 packers · 4 uploaders · queue 4/),
    ).toBeDefined();
  });

  it('lists each configuration by what sets it apart, with its run count', () => {
    renderComparison();
    const legend = screen.getByRole('list', { name: 'Configurations' });

    expect(within(legend).getByText('main thread')).toBeDefined();
    expect(within(legend).getByText('worker threads')).toBeDefined();
    expect(within(legend).getAllByText('3 runs · aaaaaaa')).toHaveLength(2);
  });

  it('draws one chart per metric, each describing its medians for assistive technology', () => {
    renderComparison();

    expect(
      screen.getByRole('img', {
        name: 'Wall time. main thread: median 786 ms; worker threads: median 965 ms.',
      }),
    ).toBeDefined();
    expect(screen.getAllByRole('img')).toHaveLength(6);
  });

  it('gives the same numbers as a table: median and range per configuration', () => {
    renderComparison();
    const row = screen.getByRole('row', { name: /Wall time \(ms\)/ });

    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['786 (762–811)', '965 (786–997)']);
  });
});

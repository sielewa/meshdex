import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import type { RunEnvironment } from './domain/run-environment.interface';
import type { RunRecord } from './domain/run-record.interface';
import { RunProbe } from './run-probe';
import { GIT_TIMEOUT_MS } from './runs.constants';

/**
 * Measures runs and writes them as JSON files, one per run, so benchmark reports are built
 * from recorded data instead of numbers copied from logs. Where runs are stored for the
 * Experiments page is a later decision; a file is the input either way.
 */
@Injectable()
export class RunRecorderService {
  start(): RunProbe {
    return new RunProbe();
  }

  async environment(): Promise<RunEnvironment> {
    const processors = cpus();
    const gitCommit = await this.git(['rev-parse', 'HEAD']);
    const changes =
      gitCommit === null ? null : await this.git(['status', '--porcelain', '--untracked-files=no']);

    return {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: processors[0]?.model.trim() ?? 'unknown',
      cpuCount: processors.length,
      totalMemoryBytes: totalmem(),
      gitCommit,
      gitDirty: changes === null ? null : changes !== '',
    };
  }

  /**
   * Writes `<dir>/<startedAt>-<command>[-<label>].json` and returns its absolute path. The
   * `wx` flag refuses to overwrite: a recorded run is never replaced by another one.
   */
  async write<TOptions, TResult>(
    dir: string,
    record: RunRecord<TOptions, TResult>,
  ): Promise<string> {
    const stamp = record.startedAt.replace(/[:.]/g, '-');
    const label = record.label === null ? '' : `-${record.label}`;
    const path = join(resolve(dir), `${stamp}-${record.command}${label}.json`);

    await mkdir(resolve(dir), { recursive: true });
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });

    return path;
  }

  /** Output of a read-only git command, or `null` when git or the checkout isn't there. */
  private async git(args: string[]): Promise<string | null> {
    try {
      const { stdout } = await promisify(execFile)('git', args, { timeout: GIT_TIMEOUT_MS });

      return stdout.trim();
    } catch {
      return null;
    }
  }
}

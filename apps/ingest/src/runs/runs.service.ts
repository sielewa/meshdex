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

@Injectable()
export class RunsService {
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

  /** `wx`: a recorded run is never overwritten. */
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

  private async git(args: string[]): Promise<string | null> {
    try {
      const { stdout } = await promisify(execFile)('git', args, { timeout: GIT_TIMEOUT_MS });

      return stdout.trim();
    } catch {
      return null;
    }
  }
}

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ImportRecord } from './domain/import-record.interface';

/**
 * JSON Lines of imported models; a re-run skips them (ADR 013). Append-only, so a crash can at
 * worst cut the last line, which is skipped on load. Appends are chained so lines never interleave.
 */
@Injectable()
export class ImportStateService {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    @InjectPinoLogger(ImportStateService.name)
    private readonly logger: PinoLogger,
  ) {}

  async load(path: string): Promise<ImportRecord[]> {
    let text: string;

    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      // Checked by `code`, not `instanceof Error`: fs errors may come from another realm.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }

      throw error;
    }

    const records: ImportRecord[] = [];
    let skipped = 0;

    for (const line of text.split('\n')) {
      if (line.trim() === '') {
        continue;
      }

      const record = this.parse(line);

      if (record === null) {
        skipped += 1;
      } else {
        records.push(record);
      }
    }

    if (skipped > 0) {
      this.logger.warn({ path, skipped }, 'Skipped unreadable lines in the import state file');
    }

    return records;
  }

  append(path: string, record: ImportRecord): Promise<void> {
    const write = this.writes.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${JSON.stringify(record)}\n`);
    });

    // A failed write fails its own caller only; later appends still run.
    this.writes = write.catch(() => undefined);

    return write;
  }

  private parse(line: string): ImportRecord | null {
    try {
      const value = JSON.parse(line) as Partial<ImportRecord>;

      return typeof value.modelId === 'string' &&
        typeof value.resolution === 'string' &&
        typeof value.assetId === 'string'
        ? (value as ImportRecord)
        : null;
    } catch {
      return null;
    }
  }
}

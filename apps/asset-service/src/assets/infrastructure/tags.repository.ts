import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../database/domain/db-executor.type';
import { assetTags, tags } from '../../database/schema';

@Injectable()
export class TagsRepository {
  /**
   * Links already-normalized tag names to an asset, creating missing tags. Three
   * statements regardless of the number of tags (no per-tag round trips); concurrent
   * uploads with the same new tag are safe thanks to ON CONFLICT DO NOTHING.
   */
  async linkToAsset(assetId: string, names: string[], tx: DbExecutor): Promise<void> {
    if (names.length === 0) {
      return;
    }

    await tx
      .insert(tags)
      .values(names.map((name) => ({ name })))
      .onConflictDoNothing({ target: tags.name });

    const tagRows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.name, names));

    await tx
      .insert(assetTags)
      .values(
        tagRows.map((tag) => ({
          assetId,
          tagId: tag.id,
        })),
      )
      .onConflictDoNothing();
  }
}

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/domain/db-executor.type';
import { assets } from '../../database/schema';
import type { NewAsset } from '../domain/new-asset.interface';

@Injectable()
export class AssetsRepository {
  async create(asset: NewAsset, tx: DbExecutor): Promise<void> {
    const createdAt = new Date(asset.createdAt);

    await tx.insert(assets).values({
      id: asset.id,
      title: asset.title,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async touch(id: string, updatedAt: number, tx: DbExecutor): Promise<void> {
    await tx
      .update(assets)
      .set({ updatedAt: new Date(updatedAt) })
      .where(eq(assets.id, id));
  }

  /** Versions and tag links go with it (ON DELETE CASCADE). */
  async deleteById(id: string, tx: DbExecutor): Promise<void> {
    await tx.delete(assets).where(eq(assets.id, id));
  }
}

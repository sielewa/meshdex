import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { StoredObject } from '../clients/asset-service/domain/stored-object.interface';
import { mediaConfig } from '../config/config.namespaces';
import { PUBLIC_KEY_PREFIX } from './assets.constants';
import { StoredFileModel } from './models/stored-file.model';

/** Unsigned and stable, so the CDN and browsers can cache it; private files get null (ADR 010). */
@Resolver(() => StoredFileModel)
export class StoredFileResolver {
  constructor(@Inject(mediaConfig.KEY) private readonly config: ConfigType<typeof mediaConfig>) {}

  @ResolveField(() => String, {
    nullable: true,
    description: 'Public URL (CDN); null for private files such as the original upload.',
  })
  url(@Parent() file: StoredObject): string | null {
    const segments = file.key.split('/');

    // Dot segments would climb out of public/ (encoding leaves dots), and encoding every other
    // segment keeps "?" and "#" from starting a query or fragment.
    if (
      !file.key.startsWith(PUBLIC_KEY_PREFIX) ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      return null;
    }

    return `${this.config.baseUrl}${segments.map(encodeURIComponent).join('/')}`;
  }
}

import { z } from 'zod';

/**
 * What survives a page reload to resume an upload: the server-side upload and the ETags of
 * parts already stored. Parsed with zod because localStorage is untrusted input (older
 * versions of the app, manual edits, other tabs).
 */
export const uploadSessionSchema = z.object({
  version: z.literal(1),
  assetId: z.uuid(),
  assetVersionId: z.uuid(),
  partSizeBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  completedParts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      etag: z.string().min(1),
    }),
  ),
  createdAt: z.number().int(),
});

export type UploadSession = z.infer<typeof uploadSessionSchema>;

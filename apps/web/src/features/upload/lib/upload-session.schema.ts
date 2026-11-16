import { z } from 'zod';

/** localStorage is untrusted input (older app versions, manual edits, other tabs). */
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

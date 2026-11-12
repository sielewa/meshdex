import { z } from 'zod';

/**
 * Quick feedback before anything is sent. asset-service stays the authority on the real
 * limits (title length, tag count, maximum size) and reports violations, which the form shows.
 */
export const uploadFormSchema = z.object({
  title: z.string().trim().min(1, 'Give the model a title'),
  tags: z.string().transform((value) => [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ]),
  file: z
    .instanceof(File, { message: 'Choose a .glb file' })
    .refine(
      (file) => file.name.toLowerCase().endsWith('.glb'),
      'Only .glb files (binary glTF) are supported',
    )
    .refine((file) => file.size > 0, 'The file is empty'),
});

export type UploadFormValues = z.output<typeof uploadFormSchema>;

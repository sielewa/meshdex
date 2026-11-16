import { z } from 'zod';

/** Quick feedback only; asset-service stays the authority on the limits. */
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

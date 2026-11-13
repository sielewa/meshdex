import { describe, expect, it } from 'vitest';
import { previewImageUrl } from '@/features/assets/lib/preview-image-url';

const thumbnail = (url: string | null): { file: { url: string | null } } => ({ file: { url } });

describe('previewImageUrl', () => {
  it('prefers a rendered thumbnail over the image supplied with the upload', () => {
    expect(
      previewImageUrl({
        thumbnails: [thumbnail('https://media/thumb.webp')],
        sourcePreview: { url: 'https://media/source.webp' },
      }),
    ).toBe('https://media/thumb.webp');
  });

  it('falls back to the source preview while there are no thumbnails', () => {
    expect(
      previewImageUrl({
        thumbnails: [],
        sourcePreview: { url: 'https://media/source.webp' },
      }),
    ).toBe('https://media/source.webp');
  });

  it('skips files without a public URL and returns null when nothing is left', () => {
    expect(
      previewImageUrl({
        thumbnails: [thumbnail(null)],
        sourcePreview: null,
      }),
    ).toBeNull();
  });
});

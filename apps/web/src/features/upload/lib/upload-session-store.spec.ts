import { describe, expect, it } from 'vitest';
import { UploadSessionStore } from '@/features/upload/lib/upload-session-store';

const file = new File(['x'], 'chair.glb', { lastModified: 42 });
const session = {
  version: 1 as const,
  assetId: '019a7a5e-8b1c-7c3d-9e4f-0000000000a1',
  assetVersionId: '019a7a5e-8b1c-7c3d-9e4f-0000000000b1',
  partSizeBytes: 16,
  partCount: 2,
  completedParts: [{ partNumber: 1, etag: '"e1"' }],
  createdAt: Date.now(),
};

describe('UploadSessionStore', () => {
  it('finds a session again by the file identity (name, size, modification time)', () => {
    const store = new UploadSessionStore(window.localStorage);
    store.save(file, session);

    expect(store.load(new File(['x'], 'chair.glb', { lastModified: 42 }))).toEqual(session);
    expect(store.load(new File(['x'], 'chair.glb', { lastModified: 43 }))).toBeNull();
    store.remove(file);
  });

  it('ignores and drops corrupted or outdated entries', () => {
    const store = new UploadSessionStore(window.localStorage);
    window.localStorage.setItem('meshdex.upload.chair.glb:1:42', '{"version":1,"assetId":"nope"}');
    expect(store.load(file)).toBeNull();
    expect(window.localStorage.getItem('meshdex.upload.chair.glb:1:42')).toBeNull();

    store.save(file, { ...session, createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    expect(store.load(file)).toBeNull();
  });

  it('works without storage (private mode): resuming is simply off', () => {
    const store = new UploadSessionStore(null);
    store.save(file, session);

    expect(store.load(file)).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphqlRequestError } from '@/graphql/graphql-request-error';
import { MultipartUploader } from '@/features/upload/lib/multipart-uploader';
import { PartUploadError } from '@/features/upload/api/part-upload-error';
import type { putPart } from '@/features/upload/api/put-part';
import type { PartUrl, UploadApi } from '@/features/upload/types/upload-api';
import type { UploadProgress } from '@/features/upload/types/upload-progress';
import { UploadSessionStore } from '@/features/upload/lib/upload-session-store';

const ASSET_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000a1';
const VERSION_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000b1';
const PART_SIZE = 10;
/** 25 bytes → parts of 10, 10 and 5 bytes. */
const file = new File(['a'.repeat(10) + 'b'.repeat(10) + 'c'.repeat(5)], 'chair.glb', {
  lastModified: 1,
});

const urlFor = (partNumber: number, suffix = ''): PartUrl => ({
  partNumber,
  url: `https://storage.test/part-${String(partNumber)}${suffix}`,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
});

/** In-memory Web Storage, so tests don't share the jsdom localStorage. */
const memoryStorage = (): Storage => {
  const data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
};

describe('MultipartUploader', () => {
  let api: { [K in keyof UploadApi]: ReturnType<typeof vi.fn> };
  let put: ReturnType<typeof vi.fn<typeof putPart>>;
  let store: UploadSessionStore;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let uploader: MultipartUploader;
  let progress: UploadProgress[];

  const run = (signal = new AbortController().signal): Promise<{ assetId: string }> =>
    uploader.upload(
      {
        file,
        title: 'Chair',
        tags: ['wood'],
      },
      {
        signal,
        onProgress: (update) => progress.push(update),
      },
    );

  beforeEach(() => {
    progress = [];
    store = new UploadSessionStore(memoryStorage());
    api = {
      initiate: vi.fn().mockResolvedValue({
        assetId: ASSET_ID,
        assetVersionId: VERSION_ID,
        partSizeBytes: PART_SIZE,
        parts: [urlFor(1), urlFor(2), urlFor(3)],
      }),
      renewPartUrls: vi.fn((_id: string, parts: number[]) =>
        Promise.resolve(parts.map((part) => urlFor(part, '-renewed'))),
      ),
      complete: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    };
    put = vi.fn<typeof putPart>(({ url, body, onProgress }) => {
      onProgress(body.size);

      return Promise.resolve(`"etag-${url.split('/').pop() ?? ''}"`);
    });
    sleep = vi.fn(() => Promise.resolve());
    uploader = new MultipartUploader({
      api: api as unknown as UploadApi,
      store,
      putPart: put,
      sleep,
      random: () => 1,
    });
  });

  it('uploads every part as a slice of the file and completes with all ETags', async () => {
    await expect(run()).resolves.toEqual({ assetId: ASSET_ID });

    const bodies = await Promise.all(put.mock.calls.map(([options]) => options.body.text()));
    expect(bodies.sort()).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb', 'ccccc']);
    expect(api.initiate).toHaveBeenCalledWith({
      title: 'Chair',
      tags: ['wood'],
      fileName: 'chair.glb',
      contentType: 'model/gltf-binary',
      sizeBytes: 25,
    });
    const [, parts] = api.complete.mock.calls[0] as [string, { partNumber: number }[]];
    expect(parts.map((part) => part.partNumber).sort()).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toMatchObject({
      uploadedBytes: 25,
      totalBytes: 25,
      completedParts: 3,
      resumed: false,
    });
    expect(store.load(file)).toBeNull();
  });

  it('resumes an interrupted upload with only the missing parts', async () => {
    put
      .mockImplementationOnce(() => Promise.resolve('"etag-1"'))
      .mockRejectedValue(new Error('tab closed'));
    await expect(run()).rejects.toThrow('tab closed');
    expect(store.load(file)?.completedParts).toEqual([{ partNumber: 1, etag: '"etag-1"' }]);

    put
      .mockReset()
      .mockImplementation(({ url }) => Promise.resolve(`"etag-${url.split('/').pop() ?? ''}"`));
    api.initiate.mockClear();
    await run();

    expect(api.initiate).not.toHaveBeenCalled();
    expect(api.renewPartUrls).toHaveBeenCalledWith(VERSION_ID, [2, 3]);
    expect(put.mock.calls.map(([options]) => options.url).sort()).toEqual([
      'https://storage.test/part-2-renewed',
      'https://storage.test/part-3-renewed',
    ]);
    expect(progress.at(-1)).toMatchObject({ resumed: true, completedParts: 3 });
  });

  it('starts over when the server no longer knows the stored upload', async () => {
    put
      .mockImplementationOnce(() => Promise.resolve('"etag-1"'))
      .mockRejectedValue(new Error('tab closed'));
    await expect(run()).rejects.toThrow();
    put.mockReset().mockResolvedValue('"etag"');
    api.renewPartUrls.mockRejectedValueOnce(new GraphqlRequestError('gone', ['NOT_FOUND'], 200));

    await run();

    expect(api.initiate).toHaveBeenCalledTimes(2);
  });

  it('renews an expired URL after a 403 and retries the part', async () => {
    put.mockRejectedValueOnce(new PartUploadError('expired', 403));

    await run();

    expect(api.renewPartUrls).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(4);
  });

  it('retries transient failures with growing jittered backoff, then gives up and keeps the session', async () => {
    put.mockRejectedValue(new PartUploadError('offline', 0));

    await expect(run()).rejects.toThrow('offline');

    // 3 parts × 2 waits (attempts 1→2 and 2→3); parts run in parallel, so calls interleave.
    const waits = sleep.mock.calls.map(([ms]) => ms);
    expect(waits).toHaveLength(6);
    expect(waits.filter((ms) => ms === 500)).toHaveLength(3);
    expect(waits.filter((ms) => ms === 1000)).toHaveLength(3);
    expect(api.complete).not.toHaveBeenCalled();
    expect(store.load(file)).not.toBeNull();
  });

  it('cancels on the server and forgets the session when aborted', async () => {
    const controller = new AbortController();
    put.mockImplementation(() => {
      controller.abort(new Error('cancelled'));

      return Promise.reject(new Error('cancelled'));
    });

    await expect(run(controller.signal)).rejects.toThrow('cancelled');

    expect(api.abort).toHaveBeenCalledWith(VERSION_ID);
    expect(store.load(file)).toBeNull();
  });
});

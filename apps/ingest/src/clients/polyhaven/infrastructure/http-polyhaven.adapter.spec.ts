import { PolyhavenRequestException } from '../exceptions/polyhaven-request.exception';
import { POLYHAVEN_USER_AGENT } from '../polyhaven.constants';
import { HttpPolyhavenAdapter } from './http-polyhaven.adapter';

const md5 = 'a'.repeat(32);
const filesResponse = {
  gltf: {
    '1k': {
      gltf: {
        url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Chair/Chair_1k.gltf',
        size: 2643,
        md5,
        include: {
          'Chair.bin': {
            url: 'https://dl.polyhaven.org/Chair.bin',
            size: 154012,
            md5,
          },
          'textures/Chair_diff_1k.jpg': {
            url: 'https://dl.polyhaven.org/Chair_diff_1k.jpg',
            size: 184246,
            md5,
          },
        },
      },
    },
  },
};

describe('HttpPolyhavenAdapter', () => {
  const adapter = new HttpPolyhavenAdapter({ apiUrl: 'https://api.example' });
  const signal = new AbortController().signal;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('lists models with the User-Agent the API terms require', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        Chair: {
          name: 'Chair',
          tags: ['wood', 42],
          categories: ['furniture'],
          authors: { 'Some Author': 'All' },
          files_hash: 'abc',
          thumbnail_url:
            'https://cdn.polyhaven.com/asset_img/thumbs/Chair.png?width=256&height=256&format=webp&v=597e',
        },
        Insecure: { thumbnail_url: 'http://cdn.polyhaven.com/asset_img/thumbs/Insecure.png' },
        Unnamed: {},
      }),
    );

    const models = await adapter.listModels(signal);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/assets?type=models',
      expect.objectContaining({ headers: { 'user-agent': POLYHAVEN_USER_AGENT } }),
    );
    expect(models).toEqual([
      {
        id: 'Chair',
        name: 'Chair',
        tags: ['wood'],
        categories: ['furniture'],
        authors: ['Some Author'],
        filesHash: 'abc',
        previewUrl:
          'https://cdn.polyhaven.com/asset_img/thumbs/Chair.png?width=512&height=512&format=webp&v=597e',
      },
      {
        id: 'Insecure',
        name: 'Insecure',
        tags: [],
        categories: [],
        authors: [],
        filesHash: null,
        previewUrl: null,
      },
      {
        id: 'Unnamed',
        name: 'Unnamed',
        tags: [],
        categories: [],
        authors: [],
        filesHash: null,
        previewUrl: null,
      },
    ]);
  });

  it('returns the .gltf and its resources at the requested resolution', async () => {
    fetchMock.mockResolvedValue(Response.json(filesResponse));

    const fileSet = await adapter.findGltfFiles('Chair', '1k', signal);

    expect(fileSet?.gltfPath).toBe('Chair_1k.gltf');
    expect(fileSet?.files.map((file) => file.path)).toEqual([
      'Chair_1k.gltf',
      'Chair.bin',
      'textures/Chair_diff_1k.jpg',
    ]);
  });

  it('returns null when the model has no glTF at that resolution', async () => {
    fetchMock.mockResolvedValue(Response.json(filesResponse));

    await expect(adapter.findGltfFiles('Chair', '4k', signal)).resolves.toBeNull();
  });

  it('rejects file entries that are not https or have no valid MD5', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        gltf: {
          '1k': {
            gltf: {
              url: 'https://dl.polyhaven.org/Chair_1k.gltf',
              size: 1,
              md5,
              include: {
                'Chair.bin': {
                  url: 'http://insecure.example/Chair.bin',
                  size: 1,
                  md5,
                },
              },
            },
          },
        },
      }),
    );

    await expect(adapter.findGltfFiles('Chair', '1k', signal)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('marks 5xx and 429 as retryable and 404 as not', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(adapter.listModels(signal)).rejects.toMatchObject({ retryable: true });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(adapter.listModels(signal)).rejects.toMatchObject({ retryable: true });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(adapter.listModels(signal)).rejects.toMatchObject({ retryable: false });
  });

  it('turns network errors into retryable failures but rethrows the caller abort', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(adapter.listModels(signal)).rejects.toBeInstanceOf(PolyhavenRequestException);

    const controller = new AbortController();
    const abort = new Error('Interrupted');

    controller.abort(abort);
    fetchMock.mockRejectedValueOnce(abort);
    await expect(adapter.listModels(controller.signal)).rejects.toBe(abort);
  });

  it('streams a download body', async () => {
    fetchMock.mockResolvedValue(new Response('bytes'));

    const body = await adapter.download('https://dl.polyhaven.org/Chair.bin', signal);
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
    }

    expect(Buffer.concat(chunks).toString()).toBe('bytes');
  });

  it('downloads a WebP preview and refuses any other type', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('webp-bytes', { headers: { 'content-type': 'image/webp' } }),
    );

    const body = await adapter.downloadPreview('https://cdn.polyhaven.com/x.png', signal);
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
    }

    expect(Buffer.concat(chunks).toString()).toBe('webp-bytes');

    fetchMock.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    );

    await expect(
      adapter.downloadPreview('https://cdn.polyhaven.com/x.png', signal),
    ).rejects.toMatchObject({ retryable: false });
  });
});

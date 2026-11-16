import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import type { PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { UnsafeCachePathException } from '../cache/exceptions/unsafe-cache-path.exception';
import { CacheService } from '../cache/cache.service';
import { UnsupportedGltfException } from './exceptions/unsupported-gltf.exception';
import { PackingService } from './packing.service';

const logger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

/** One triangle (3 × vec3 float) textured with an image whose name needs percent-encoding. */
const triangle = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const image = Buffer.from('\x89PNG\r\n\x1a\nnot really an image');

function gltf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: { version: '2.0' },
    buffers: [{ uri: 'Chair.bin', byteLength: triangle.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: triangle.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    images: [{ uri: 'textures/Chair%20diff.png' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    ...overrides,
  };
}

describe('PackingService', () => {
  let dir: string;
  let cache: CacheService;
  let packer: PackingService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-pack-'));
    cache = new CacheService({ dir });
    packer = new PackingService(cache, logger);
  });

  afterEach(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  /** Writes the model's files and returns its manifest (sizes/MD5 don't matter to the packer). */
  async function cacheModel(json: Record<string, unknown>): Promise<CachedModelManifest> {
    const files: Record<string, Buffer> = {
      'Chair_1k.gltf': Buffer.from(JSON.stringify(json)),
      'Chair.bin': Buffer.from(triangle.buffer),
      'textures/Chair diff.png': image,
    };
    const modelDir = cache.modelDir('Chair_01', '1k');

    for (const [path, content] of Object.entries(files)) {
      const target = join(modelDir, path);

      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    return {
      modelId: 'Chair_01',
      name: 'Chair',
      tags: [],
      categories: [],
      authors: [],
      resolution: '1k',
      filesHash: null,
      gltfPath: 'Chair_1k.gltf',
      files: Object.entries(files).map(([path, content]) => ({
        path,
        sizeBytes: content.length,
        md5: '0'.repeat(32),
      })),
      fetchedAt: '2026-11-12T12:00:00.000Z',
    };
  }

  it('packs the .gltf, its buffer and its texture into one GLB with the same content', async () => {
    const glb = await packer.pack(await cacheModel(gltf()));

    expect(Buffer.from(glb.subarray(0, 4)).toString('ascii')).toBe('glTF');

    // Read back with the library: everything is now inside the GLB, nothing external.
    const document = await new NodeIO().readBinary(glb);
    const root = document.getRoot();
    const position = root.listMeshes()[0]?.listPrimitives()[0]?.getAttribute('POSITION');

    expect(root.listBuffers()).toHaveLength(1);
    expect(Array.from(position?.getArray() ?? [])).toEqual(Array.from(triangle));
    expect(Buffer.from(root.listTextures()[0]?.getImage() ?? [])).toEqual(image);
    expect(root.listTextures()[0]?.getMimeType()).toBe('image/png');
  });

  it('keeps official extensions such as KHR_materials_transmission (glass)', async () => {
    const manifest = await cacheModel(
      gltf({
        extensionsUsed: ['KHR_materials_transmission'],
        materials: [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            extensions: { KHR_materials_transmission: { transmissionFactor: 0.9 } },
          },
        ],
      }),
    );

    const glb = await packer.pack(manifest);
    // Read back without registering extensions: the raw JSON chunk must still carry it.
    const { json } = await new NodeIO().binaryToJSON(glb);

    expect(json.extensionsUsed).toEqual(['KHR_materials_transmission']);
    expect(json.materials?.[0]?.extensions).toEqual({
      KHR_materials_transmission: { transmissionFactor: 0.9 },
    });
  });

  it('fails a model whose extensions the packer would silently drop', async () => {
    const manifest = await cacheModel(
      gltf({
        extensionsUsed: ['VENDOR_unknown'],
        materials: [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            extensions: { VENDOR_unknown: { anything: 1 } },
          },
        ],
      }),
    );

    await expect(packer.pack(manifest)).rejects.toThrow(
      new UnsupportedGltfException("glTF extensions the packer can't keep: VENDOR_unknown"),
    );
  });

  it.each([
    ['a file outside the manifest', 'Other.bin', UnsupportedGltfException],
    ['a network URI', 'https://example.com/Chair.bin', UnsupportedGltfException],
    ['the .gltf itself', 'Chair_1k.gltf', UnsupportedGltfException],
  ])('refuses a buffer pointing at %s', async (_case, uri, exception) => {
    const manifest = await cacheModel(
      gltf({ buffers: [{ uri, byteLength: triangle.byteLength }] }),
    );

    await expect(packer.pack(manifest)).rejects.toThrow(exception);
  });

  it('refuses a manifest entry that would leave the model folder', async () => {
    const manifest = await cacheModel(
      gltf({ buffers: [{ uri: '../../Chair.bin', byteLength: triangle.byteLength }] }),
    );

    manifest.files.push({
      path: '../../Chair.bin',
      sizeBytes: 36,
      md5: '0'.repeat(32),
    });

    await expect(packer.pack(manifest)).rejects.toThrow(UnsafeCachePathException);
  });
});

import { StoredFileResolver } from './stored-file.resolver';

describe('StoredFileResolver', () => {
  const resolver = new StoredFileResolver({ baseUrl: 'http://localhost:8333/meshdex-assets/' });

  function file(key: string): { key: string; sizeBytes: number; contentType: string } {
    return {
      key,
      sizeBytes: 150_000,
      contentType: 'image/webp',
    };
  }

  it('gives a public file the media base URL plus its key', () => {
    expect(resolver.url(file('public/previews/a1/v1.webp'))).toBe(
      'http://localhost:8333/meshdex-assets/public/previews/a1/v1.webp',
    );
  });

  it('gives a private file no URL', () => {
    expect(resolver.url(file('originals/a1/v1.glb'))).toBeNull();
  });

  it('does not treat a lookalike prefix as public', () => {
    expect(resolver.url(file('publicity/a1/v1.webp'))).toBeNull();
  });

  it('encodes each key segment, so a key cannot start a query or a fragment', () => {
    expect(resolver.url(file('public/a?b#c/x.webp'))).toBe(
      'http://localhost:8333/meshdex-assets/public/a%3Fb%23c/x.webp',
    );
  });

  it.each(['public/../originals/a1/v1.glb', 'public/./x.webp', 'public//x.webp'])(
    'gives no URL to a key with a dot or empty segment (%s)',
    (key) => {
      expect(resolver.url(file(key))).toBeNull();
    },
  );
});

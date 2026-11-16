import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PartUploadException } from '../exceptions/part-upload.exception';
import { HttpPresignedUploadAdapter } from './http-presigned-upload.adapter';

interface Received {
  method: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** A local HTTP server standing in for object storage: records requests, answers as told. */
describe('HttpPresignedUploadAdapter', () => {
  const adapter = new HttpPresignedUploadAdapter();
  const signal = new AbortController().signal;
  let server: Server;
  let url: string;
  let received: Received[];
  let answer: { status: number; etag?: string };

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];

      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          method: request.method,
          headers: request.headers,
          body: Buffer.concat(chunks),
        });

        if (answer.etag !== undefined) {
          response.setHeader('ETag', answer.etag);
        }

        response.statusCode = answer.status;
        response.end('<Error/>');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/bucket/key?X-Amz-Signature=secret`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
    answer = {
      status: 200,
      etag: '"abc"',
    };
  });

  it('PUTs exactly the bytes of the view with a Content-Length and returns the ETag', async () => {
    const whole = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // A view in the middle of a bigger buffer, as the uploader slices parts.
    const part = whole.subarray(3, 7);

    await expect(adapter.putPart(url, part, signal)).resolves.toBe('"abc"');
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('PUT');
    expect(received[0]?.headers['content-length']).toBe('4');
    expect(received[0]?.headers['transfer-encoding']).toBeUndefined();
    expect(received[0]?.headers['content-type']).toBeUndefined();
    expect([...(received[0]?.body ?? [])]).toEqual([3, 4, 5, 6]);
  });

  it('reports an expired signature without putting the URL in the message', async () => {
    answer = { status: 403 };

    const error = (await adapter
      .putPart(url, Uint8Array.from([1]), signal)
      .catch((caught: unknown) => caught)) as PartUploadException;

    expect(error).toBeInstanceOf(PartUploadException);
    expect(error.isSignatureRejected).toBe(true);
    expect(error.isTransient).toBe(false);
    expect(error.message).not.toContain('secret');
  });

  it('marks 503 and network errors as transient', async () => {
    answer = { status: 503 };
    await expect(adapter.putPart(url, Uint8Array.from([1]), signal)).rejects.toMatchObject({
      isTransient: true,
    });

    await expect(
      adapter.putPart('http://127.0.0.1:1/closed', Uint8Array.from([1]), signal),
    ).rejects.toMatchObject({
      status: 0,
      isTransient: true,
    });
  });

  it('fails a success answer that has no ETag', async () => {
    answer = { status: 200 };

    await expect(adapter.putPart(url, Uint8Array.from([1]), signal)).rejects.toThrow(
      'Object storage returned no ETag',
    );
  });

  it('rethrows the caller abort as it is', async () => {
    const controller = new AbortController();
    const reason = new Error('Interrupted');

    controller.abort(reason);

    await expect(adapter.putPart(url, Uint8Array.from([1]), controller.signal)).rejects.toBe(
      reason,
    );
  });

  it('PUTs a whole object with the Content-Type its URL was signed for, needing no ETag', async () => {
    answer = { status: 200 };

    await expect(
      adapter.putObject(url, Uint8Array.from([42, 43]), 'image/webp', signal),
    ).resolves.toBeUndefined();
    expect(received[0]?.headers['content-type']).toBe('image/webp');
    expect(received[0]?.headers['content-length']).toBe('2');
  });
});

import { PartUploadError } from '@/features/upload/api/part-upload-error';

/**
 * PUTs one part to its presigned URL and returns the ETag object storage assigned to it.
 *
 * XMLHttpRequest instead of fetch: browsers report upload progress only for XHR
 * (`xhr.upload.onprogress`); fetch can't observe bytes leaving the machine. The body is a
 * `Blob` slice, which the browser streams from disk — the part is never copied into memory.
 * No Content-Type header is sent: the presigned signature doesn't cover one.
 */
export function putPart(options: {
  url: string;
  body: Blob;
  signal: AbortSignal;
  onProgress: (loadedBytes: number) => void;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // An XHR aborted before send() fires no events, so a late abort must be handled here.
    if (options.signal.aborted) {
      reject(
        options.signal.reason instanceof Error
          ? options.signal.reason
          : new Error('Upload cancelled'),
      );

      return;
    }

    const xhr = new XMLHttpRequest();
    const abort = (): void => {
      xhr.abort();
    };

    xhr.open('PUT', options.url);
    xhr.upload.onprogress = (event) => {
      options.onProgress(event.loaded);
    };
    xhr.onload = () => {
      options.signal.removeEventListener('abort', abort);

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new PartUploadError(`Part upload failed with HTTP ${String(xhr.status)}`, xhr.status),
        );

        return;
      }

      // Readable only because the bucket's CORS rules expose it (Access-Control-Expose-Headers).
      const etag = xhr.getResponseHeader('ETag');

      if (!etag) {
        reject(
          new PartUploadError('Object storage did not expose the ETag header (CORS)', xhr.status),
        );

        return;
      }

      resolve(etag);
    };
    xhr.onerror = () => {
      options.signal.removeEventListener('abort', abort);
      reject(new PartUploadError('Network error while uploading a part', 0));
    };
    xhr.onabort = () => {
      reject(
        options.signal.reason instanceof Error
          ? options.signal.reason
          : new Error('Upload cancelled'),
      );
    };

    options.signal.addEventListener('abort', abort, { once: true });
    xhr.send(options.body);
  });
}

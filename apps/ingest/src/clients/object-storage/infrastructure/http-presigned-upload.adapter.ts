import { Injectable } from '@nestjs/common';
import type { PresignedUploadPort } from '../domain/presigned-upload-port.interface';
import { PartUploadException } from '../exceptions/part-upload.exception';
import { PART_UPLOAD_TIMEOUT_MS } from '../object-storage.constants';

/**
 * `PresignedUploadPort` with the global `fetch`. The body is a `Uint8Array` view of the packed
 * GLB, so its length is known: fetch sends `Content-Length` instead of chunked encoding, which
 * S3 requires for a presigned PUT, and only the view's bytes are sent, without a copy. No
 * Content-Type is sent: the presigned signature doesn't cover one. URLs are credentials, so
 * they never appear in error messages.
 */
@Injectable()
export class HttpPresignedUploadAdapter implements PresignedUploadPort {
  async putPart(url: string, body: Uint8Array, signal: AbortSignal): Promise<string> {
    const timeout = AbortSignal.timeout(PART_UPLOAD_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'PUT',
        body,
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      throw new PartUploadException(
        timeout.aborted ? 'Part upload timed out' : 'Network error while uploading a part',
        0,
        { cause: error },
      );
    }

    // Read the (small) response to the end, so the connection goes back to the pool.
    await response.arrayBuffer();

    if (!response.ok) {
      throw new PartUploadException(
        `Part upload failed with HTTP ${String(response.status)}`,
        response.status,
      );
    }

    const etag = response.headers.get('etag');

    if (etag === null || etag === '') {
      throw new PartUploadException('Object storage returned no ETag', response.status);
    }

    return etag;
  }
}

import { Injectable } from '@nestjs/common';
import type { PresignedUploadPort } from '../domain/presigned-upload-port.interface';
import { PartUploadException } from '../exceptions/part-upload.exception';
import { PART_UPLOAD_TIMEOUT_MS } from '../object-storage.constants';

/**
 * `PresignedUploadPort` with the global `fetch`. The body is a `Uint8Array` view of the packed
 * GLB, so its length is known: fetch sends `Content-Length` instead of chunked encoding, which
 * S3 requires for a presigned PUT, and only the view's bytes are sent, without a copy. Parts
 * carry no Content-Type (their signature covers none); a whole object sends the one its URL
 * was signed with. URLs are credentials, so they never appear in error messages.
 */
@Injectable()
export class HttpPresignedUploadAdapter implements PresignedUploadPort {
  async putPart(url: string, body: Uint8Array, signal: AbortSignal): Promise<string> {
    const response = await this.put(url, body, {}, signal);
    const etag = response.headers.get('etag');

    if (etag === null || etag === '') {
      throw new PartUploadException('Object storage returned no ETag', response.status);
    }

    return etag;
  }

  async putObject(
    url: string,
    body: Uint8Array,
    contentType: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.put(url, body, { 'content-type': contentType }, signal);
  }

  /** One PUT with the shared timeout and error mapping; the response is read to the end. */
  private async put(
    url: string,
    body: Uint8Array,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(PART_UPLOAD_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'PUT',
        body,
        headers,
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      throw new PartUploadException(
        timeout.aborted ? 'Upload timed out' : 'Network error while uploading',
        0,
        { cause: error },
      );
    }

    // Read the (small) response to the end, so the connection goes back to the pool.
    await response.arrayBuffer();

    if (!response.ok) {
      throw new PartUploadException(
        `Upload failed with HTTP ${String(response.status)}`,
        response.status,
      );
    }

    return response;
  }
}

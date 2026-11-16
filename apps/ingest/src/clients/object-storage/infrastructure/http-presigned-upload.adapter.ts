import { Injectable } from '@nestjs/common';
import type { PresignedUploadPort } from '../domain/presigned-upload-port.interface';
import { PartUploadException } from '../exceptions/part-upload.exception';
import { PART_UPLOAD_TIMEOUT_MS } from '../object-storage.constants';

/**
 * A `Uint8Array` body has a known length, so fetch sends `Content-Length` (S3 rejects chunked
 * presigned PUTs) without copying. URLs are credentials and never appear in errors.
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

    // An unread body keeps the connection out of the pool.
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

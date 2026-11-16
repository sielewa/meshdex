import type { UploadProgress } from '@/features/upload/types/upload-progress';

export type UploadState =
  | { phase: 'idle' }
  | {
      phase: 'uploading';
      progress: UploadProgress | null;
      /** Bytes per second of this attempt (parts reused from an earlier attempt excluded). */
      bytesPerSecond: number | null;
    }
  | { phase: 'failed'; message: string; resumable: boolean }
  | { phase: 'cancelled' };

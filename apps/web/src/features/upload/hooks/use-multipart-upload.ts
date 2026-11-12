'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { MultipartUploader } from '@/features/upload/lib/multipart-uploader';
import { putPart } from '@/features/upload/api/put-part';
import type { UploadFormValues } from '@/features/upload/components/upload-form.schema';
import type { UploadProgress } from '@/features/upload/types/upload-progress';
import { UploadSessionStore } from '@/features/upload/lib/upload-session-store';
import type { UploadState } from '@/features/upload/types/upload-state';
import { createUploadApi } from '@/features/upload/api/upload.queries';

/**
 * Runs one upload at a time for the upload form: progress and speed for display, cancel,
 * and on success a fresh asset list plus navigation to the new asset.
 */
export function useMultipartUpload(): {
  state: UploadState;
  start: (values: UploadFormValues) => Promise<void>;
  cancel: () => void;
} {
  const endpoint = useGatewayEndpoint();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const uploader = useMemo(
    () =>
      new MultipartUploader({
        api: createUploadApi(endpoint),
        store: new UploadSessionStore(),
        putPart,
      }),
    [endpoint],
  );

  const start = useCallback(
    async (values: UploadFormValues): Promise<void> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({
        phase: 'uploading',
        progress: null,
        bytesPerSecond: null,
      });
      // Speed counts only bytes sent in this attempt, from the first progress report on.
      let baseline: { bytes: number; at: number } | null = null;

      const onProgress = (progress: UploadProgress): void => {
        const now = performance.now();
        baseline ??= {
          bytes: progress.uploadedBytes,
          at: now,
        };
        const elapsedSeconds = (now - baseline.at) / 1000;

        setState({
          phase: 'uploading',
          progress,
          bytesPerSecond:
            elapsedSeconds > 0.5
              ? (progress.uploadedBytes - baseline.bytes) / elapsedSeconds
              : null,
        });
      };

      try {
        const { assetId } = await uploader.upload(values, {
          signal: controller.signal,
          onProgress,
        });

        await queryClient.invalidateQueries({ queryKey: ['assets'] });
        router.push(`/assets/${assetId}`);
      } catch (error) {
        if (controller.signal.aborted) {
          setState({ phase: 'cancelled' });

          return;
        }

        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : 'Upload failed',
          // Parts already stored are remembered; picking the same file continues from there.
          resumable: true,
        });
      } finally {
        controllerRef.current = null;
      }
    },
    [queryClient, router, uploader],
  );

  const cancel = useCallback((): void => {
    controllerRef.current?.abort(new Error('Upload cancelled'));
  }, []);

  return {
    state,
    start,
    cancel,
  };
}

import type { ReactNode } from 'react';
import { formatBytes } from '@/lib/format-bytes';
import type { UploadProgress } from '@/features/upload/types/upload-progress';

export function UploadProgressBar({
  progress,
  bytesPerSecond,
}: {
  progress: UploadProgress | null;
  bytesPerSecond: number | null;
}): ReactNode {
  if (!progress) {
    return <p className="text-sm text-neutral-400">Preparing upload…</p>;
  }

  const remainingSeconds =
    bytesPerSecond && bytesPerSecond > 0
      ? Math.ceil((progress.totalBytes - progress.uploadedBytes) / bytesPerSecond)
      : null;

  return (
    <div className="space-y-2">
      <progress
        className="h-2 w-full overflow-hidden rounded [&::-moz-progress-bar]:bg-sky-500 [&::-webkit-progress-bar]:bg-neutral-800 [&::-webkit-progress-value]:bg-sky-500"
        value={progress.uploadedBytes}
        max={progress.totalBytes}
        aria-label="Upload progress"
      />
      <p className="text-sm text-neutral-400">
        {formatBytes(progress.uploadedBytes)} of {formatBytes(progress.totalBytes)} · part{' '}
        {progress.completedParts}/{progress.partCount}
        {bytesPerSecond !== null && ` · ${formatBytes(bytesPerSecond)}/s`}
        {remainingSeconds !== null && ` · ~${String(remainingSeconds)} s left`}
      </p>
      {progress.resumed && (
        <p className="text-sm text-emerald-300">Resumed: parts uploaded earlier were reused.</p>
      )}
    </div>
  );
}

'use client';

import { useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { UploadProgressBar } from '@/features/upload/components/upload-progress-bar';
import { uploadFormSchema } from '@/features/upload/components/upload-form.schema';
import { useMultipartUpload } from '@/features/upload/hooks/use-multipart-upload';

export function UploadForm(): ReactNode {
  const { state, start, cancel } = useMultipartUpload();
  const id = useId();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const uploading = state.phase === 'uploading';

  const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fileInput = event.currentTarget.elements.namedItem('file');
    const parsed = uploadFormSchema.safeParse({
      title: data.get('title'),
      tags: data.get('tags') ?? '',
      file: fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined,
    });

    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );

      return;
    }

    setFieldErrors({});
    void start(parsed.data);
  };

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" noValidate>
      <div className="space-y-1">
        <label htmlFor={`${id}-title`} className="block text-sm font-medium">
          Title
        </label>
        <input
          id={`${id}-title`}
          name="title"
          disabled={uploading}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          aria-invalid={fieldErrors.title !== undefined}
          aria-describedby={fieldErrors.title ? `${id}-title-error` : undefined}
        />
        {fieldErrors.title && (
          <p id={`${id}-title-error`} className="text-sm text-red-300">
            {fieldErrors.title}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-tags`} className="block text-sm font-medium">
          Tags
        </label>
        <input
          id={`${id}-tags`}
          name="tags"
          disabled={uploading}
          placeholder="chair, wood, furniture"
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          aria-describedby={`${id}-tags-help`}
        />
        <p id={`${id}-tags-help`} className="text-xs text-neutral-500">
          Separated by commas.
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-file`} className="block text-sm font-medium">
          Model (.glb)
        </label>
        <input
          id={`${id}-file`}
          type="file"
          name="file"
          accept=".glb,model/gltf-binary"
          disabled={uploading}
          className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-100"
          aria-invalid={fieldErrors.file !== undefined}
          aria-describedby={`${id}-file-help${fieldErrors.file ? ` ${id}-file-error` : ''}`}
        />
        {fieldErrors.file && (
          <p id={`${id}-file-error`} className="text-sm text-red-300">
            {fieldErrors.file}
          </p>
        )}
        <p id={`${id}-file-help`} className="text-xs text-neutral-500">
          An interrupted upload continues where it stopped when you choose the same file again.
        </p>
      </div>

      {state.phase === 'uploading' && (
        <UploadProgressBar progress={state.progress} bytesPerSecond={state.bytesPerSecond} />
      )}
      {state.phase === 'failed' && (
        <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">
          Upload failed: {state.message}
          {state.resumable && ' Submit again with the same file to continue.'}
        </p>
      )}
      {state.phase === 'cancelled' && <p className="text-sm text-neutral-400">Upload cancelled.</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          Upload
        </button>
        {uploading && (
          <button
            type="button"
            onClick={cancel}
            className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

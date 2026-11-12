import {
  UPLOAD_SESSION_KEY_PREFIX,
  UPLOAD_SESSION_MAX_AGE_MS,
} from '@/features/upload/upload.constants';
import {
  uploadSessionSchema,
  type UploadSession,
} from '@/features/upload/lib/upload-session.schema';

/**
 * Resumable upload sessions in localStorage, keyed by the file's identity. A browser can't
 * keep a reference to a file across reloads, so the user picks the same file again and
 * name + size + modification time recognise it. Storage errors (private mode, quota) only
 * disable resuming; they never fail the upload.
 */
export class UploadSessionStore {
  constructor(private readonly storage: Storage | null = UploadSessionStore.defaultStorage()) {}

  load(file: File): UploadSession | null {
    try {
      const raw = this.storage?.getItem(this.key(file));

      if (!raw) {
        return null;
      }

      const parsed = uploadSessionSchema.safeParse(JSON.parse(raw));

      if (!parsed.success || Date.now() - parsed.data.createdAt > UPLOAD_SESSION_MAX_AGE_MS) {
        this.remove(file);

        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }

  save(file: File, session: UploadSession): void {
    try {
      this.storage?.setItem(this.key(file), JSON.stringify(session));
    } catch {
      // Resuming is best effort.
    }
  }

  remove(file: File): void {
    try {
      this.storage?.removeItem(this.key(file));
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  private key(file: File): string {
    return `${UPLOAD_SESSION_KEY_PREFIX}${file.name}:${String(file.size)}:${String(file.lastModified)}`;
  }

  private static defaultStorage(): Storage | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return null;
    }
  }
}

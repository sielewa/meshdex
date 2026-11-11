import { MAX_TAG_LENGTH, MAX_TAGS_PER_ASSET } from '../assets.constants';
import { InvalidUploadRequestException } from '../exceptions/invalid-upload-request.exception';

/**
 * Turns user input into canonical tag names: trimmed, lower-case, inner whitespace
 * as single dashes ("Wooden  Chair" -> "wooden-chair"), duplicates removed, input
 * order kept. The `tags_name_normalized` check constraint enforces the same rule.
 */
export function normalizeTagNames(rawNames: string[]): string[] {
  const names: string[] = [];

  for (const raw of rawNames) {
    const name = raw.trim().toLowerCase().replace(/\s+/g, '-');

    if (name.length === 0 || names.includes(name)) {
      continue;
    }

    if (name.length > MAX_TAG_LENGTH) {
      throw new InvalidUploadRequestException(
        `Tag "${name.slice(0, 20)}…" is longer than ${String(MAX_TAG_LENGTH)} characters`,
      );
    }

    names.push(name);
  }

  if (names.length > MAX_TAGS_PER_ASSET) {
    throw new InvalidUploadRequestException(`At most ${String(MAX_TAGS_PER_ASSET)} tags per asset`);
  }

  return names;
}

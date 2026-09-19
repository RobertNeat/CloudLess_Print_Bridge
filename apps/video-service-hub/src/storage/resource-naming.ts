import type { CameraRegistryEntry } from '../camera-registry/camera-registry.types';
import type { MediaResourceKind } from './storage.types';

const finalExtensionByKind: Record<MediaResourceKind, string> = {
  captures: 'jpg',
  timelapses: 'mp4',
  recordings: 'mp4',
  live: 'mp4',
  audio: 'wav',
};

const finalPrefixByKind: Record<MediaResourceKind, string> = {
  captures: 'image',
  timelapses: 'timelapse',
  recordings: 'recording',
  live: 'live',
  audio: 'audio',
};

/** Strips everything a resolved name/id could contain that isn't safe as a path component. */
function sanitizeNamePart(value: string): string {
  const withUnderscores = value.replace(/\s+/g, '_');
  const cleaned = withUnderscores.replace(/[^A-Za-z0-9_\-.,]/g, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

/**
 * Resolves the human-facing {name} slot used in a finished asset's filename,
 * plus the camera's {ip} for display/debugging purposes (ResourceMetadata.
 * cameraIp) -- the ip is no longer part of the filename itself. Resolved
 * from the camera registry entry (if any) present at the moment
 * transcoding/completion finishes. The result is meant to be frozen into
 * ResourceMetadata.cameraName/cameraIp so a later camera rename never
 * retroactively changes an already-finished file's name.
 */
export function resolveCameraNaming(
  cameraId: string,
  entry: CameraRegistryEntry | undefined,
): { name: string; ip?: string } {
  const rawName = entry?.displayName?.trim() || cameraId;
  const name = sanitizeNamePart(rawName);
  let ip: string | undefined;
  if (entry?.baseUrl) {
    try {
      ip = new URL(entry.baseUrl).hostname || undefined;
    } catch {
      ip = undefined;
    }
  }
  return { name, ip };
}

/** Builds the final filename for a completed resource, e.g. `timelapse-front.mp4`. */
export function buildFinalFileName(
  kind: MediaResourceKind,
  naming: { name: string; ip?: string },
): string {
  const prefix = finalPrefixByKind[kind];
  const extension = finalExtensionByKind[kind];
  return `${prefix}-${naming.name}.${extension}`;
}

/** Builds the 1-based, 3-digit-padded part filename for a resource kind, e.g. `001.jpg`. */
export function buildPartFileName(
  kind: MediaResourceKind,
  partNumber: number,
): string {
  const extensionByPartKind: Record<MediaResourceKind, string> = {
    captures: 'jpg',
    timelapses: 'jpg',
    recordings: 'mjpeg',
    live: 'mjpeg',
    audio: 'wav',
  };
  return `${String(partNumber).padStart(3, '0')}.${extensionByPartKind[kind]}`;
}

import type { Readable } from 'node:stream';

export type MediaResourceKind =
  'captures' | 'timelapses' | 'recordings' | 'audio' | 'live';

export type StoredFile = {
  size: number;
  sha256: string;
  duplicate: boolean;
};

export type ManifestPart = {
  partNumber: number;
  size: number;
  sha256: string;
  fileName: string;
  storedAt: string;
};

/**
 * One shared manifest shape across every resource kind. Fields that don't
 * apply to a given kind are simply left undefined -- e.g. a single-file
 * capture has no `totalFrames`, and only recording/live/audio carry
 * `durationSeconds`. This manifest only exists while a resource is
 * in-progress or freshly completed; once transcoding finishes it is deleted
 * and replaced by a sibling metadata.json (see ResourceMetadata).
 */
export type ResourceManifest = {
  schemaVersion: 1;
  kind: MediaResourceKind;
  cameraId: string;
  requestId: string;
  totalParts: number;
  receivedParts: number[];
  complete: boolean;
  parts: Record<string, ManifestPart>;
  resolution?: string;
  durationSeconds?: number;
  totalFrames?: number;
  createdAt: string;
  updatedAt: string;
  displayName?: string;
};

/**
 * Replaces manifest.json in a resource's directory once transcoding (or, for
 * captures, immediate renaming) has finished. Carries only the fields that
 * describe the finished asset -- per-part bookkeeping (receivedParts, parts,
 * totalParts) is meaningless after the parts have been deleted, so it is not
 * carried over.
 */
export type ResourceMetadata = {
  schemaVersion: 1;
  kind: MediaResourceKind;
  cameraId: string;
  requestId: string;
  fileName: string;
  cameraName: string;
  cameraIp?: string;
  resolution?: string;
  durationSeconds?: number;
  totalFrames?: number;
  size: number;
  sha256: string;
  createdAt: string;
  completedAt: string;
  displayName?: string;
};

export type LiveViewer = {
  stream: Readable;
  contentType: string;
  requestId: string;
};

/**
 * Audio waveform thumbnails render as a gradient (white-to-darkgrey for dark
 * mode, black-to-darkgrey for light mode) baked in at generation time, since
 * the backend generates the file once at ingest and has no way to know a
 * viewer's live theme preference. Both variants are generated together.
 */
export type AudioThumbnailVariant = 'dark' | 'light';

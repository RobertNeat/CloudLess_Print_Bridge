export type StoredFile = {
  size: number;
  sha256: string;
  duplicate: boolean;
};

export type CaptureEntry = {
  sequence: number;
  size: number;
  sha256: string;
  fileName: string;
  storedAt: string;
};

export type CaptureManifest = {
  schemaVersion: 1;
  cameraId: string;
  requestId: string;
  resolution: string;
  captures: CaptureEntry[];
  displayName?: string;
};

export type RecordingPart = {
  partNumber: number;
  size: number;
  sha256: string;
  fileName: string;
  storedAt: string;
};

export type RecordingManifest = {
  schemaVersion: 1;
  cameraId: string;
  requestId: string;
  resolution: string;
  totalParts: number;
  requestedDurationSeconds: number;
  totalFrames: number;
  receivedParts: number[];
  complete: boolean;
  createdAt: string;
  updatedAt: string;
  parts: Record<string, RecordingPart>;
  displayName?: string;
};

export type AudioManifest = {
  schemaVersion: 1;
  cameraId: string;
  requestId: string;
  fileName: string;
  durationSeconds: number;
  size: number;
  sha256: string;
  storedAt: string;
  displayName?: string;
};

export type CompletedLiveFile = {
  cameraId: string;
  requestId: string;
  fileName: string;
  size: number;
  finishedAt: string;
};

export type CompletedLive = {
  cameraId: string;
  requestId: string;
  resolution: string;
  filePath: string;
  bytes: number;
  frames: number;
  finishedAt: string;
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

import type { Readable } from 'node:stream';

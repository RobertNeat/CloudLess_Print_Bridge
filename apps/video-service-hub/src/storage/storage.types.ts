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
import type { Readable } from 'node:stream';

import { BadRequestException, Injectable } from '@nestjs/common';
import { MediaStorageService } from '../storage/media-storage.service';
import type {
  MediaItemDto,
  MediaListQuery,
  MediaListResult,
} from './media-library.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class MediaLibraryService {
  constructor(private readonly storage: MediaStorageService) {}

  async list(query: MediaListQuery): Promise<MediaListResult> {
    const limit = this.parseLimit(query.limit);
    const items = (await this.collectAll())
      .filter((item) => !query.cameraId || item.cameraId === query.cameraId)
      .filter((item) => !query.kind || item.kind === query.kind)
      .sort((left, right) =>
        this.sortKey(right).localeCompare(this.sortKey(left)),
      );

    const cursor = this.decodeCursor(query.cursor);
    const startIndex = cursor
      ? items.findIndex((item) => this.sortKey(item) === cursor)
      : 0;
    if (cursor && startIndex === -1) {
      throw new BadRequestException('cursor does not match any known item');
    }

    const page = items.slice(startIndex, startIndex + limit);
    const nextItem = items[startIndex + limit];
    return {
      items: page,
      nextCursor: nextItem
        ? this.encodeCursor(this.sortKey(nextItem))
        : undefined,
    };
  }

  private async collectAll(): Promise<MediaItemDto[]> {
    const [audio, liveRecordings] = await Promise.all([
      this.audioItems(),
      this.liveRecordingItems(),
    ]);
    return [
      ...this.recordingItems(),
      ...this.captureItems(),
      ...audio,
      ...liveRecordings,
    ];
  }

  private recordingItems(): MediaItemDto[] {
    return this.storage
      .listRecordingManifests()
      .filter((manifest) => manifest.complete)
      .map((manifest) => ({
        id: `recording:${manifest.cameraId}:${manifest.requestId}`,
        kind: 'recording',
        cameraId: manifest.cameraId,
        requestId: manifest.requestId,
        fileName: `${manifest.requestId}.mjpeg`,
        capturedAt: manifest.createdAt,
        durationSeconds: manifest.requestedDurationSeconds,
        frameCount: manifest.totalFrames,
        size: Object.values(manifest.parts).reduce(
          (total, part) => total + part.size,
          0,
        ),
        thumbnailUrl: '/api/v1/media/thumbnail-placeholder',
        downloadUrl: `/api/v1/recordings/${manifest.cameraId}/${manifest.requestId}/file`,
      }));
  }

  private captureItems(): MediaItemDto[] {
    return this.storage.listCaptureManifests().map((manifest) => {
      const latest = [...manifest.captures].sort((left, right) =>
        right.storedAt.localeCompare(left.storedAt),
      )[0];
      return {
        id: `image:${manifest.cameraId}:${manifest.requestId}`,
        kind: 'image',
        cameraId: manifest.cameraId,
        requestId: manifest.requestId,
        fileName: latest.fileName,
        capturedAt: latest.storedAt,
        frameCount: manifest.captures.length,
        size: manifest.captures.reduce((total, item) => total + item.size, 0),
        thumbnailUrl: '/api/v1/media/thumbnail-placeholder',
        downloadUrl: `/api/v1/captures/${manifest.cameraId}/${manifest.requestId}/file?fileName=${encodeURIComponent(latest.fileName)}`,
      };
    });
  }

  private async liveRecordingItems(): Promise<MediaItemDto[]> {
    const files = await this.storage.listCompletedLiveRecordings();
    return files.map((file) => ({
      id: `live-recording:${file.cameraId}:${file.requestId}`,
      kind: 'recording',
      cameraId: file.cameraId,
      requestId: file.requestId,
      fileName: file.fileName,
      capturedAt: file.finishedAt,
      size: file.size,
      thumbnailUrl: '/api/v1/media/thumbnail-placeholder',
      downloadUrl: `/api/v1/live-recordings/${file.cameraId}/${file.requestId}/file`,
    }));
  }

  private async audioItems(): Promise<MediaItemDto[]> {
    const manifests = await this.storage.listAudioManifests();
    return manifests.map((manifest) => ({
      id: `audio:${manifest.cameraId}:${manifest.requestId}`,
      kind: 'audio',
      cameraId: manifest.cameraId,
      requestId: manifest.requestId,
      fileName: manifest.fileName,
      capturedAt: manifest.storedAt,
      durationSeconds: manifest.durationSeconds,
      size: manifest.size,
      thumbnailUrl: '/api/v1/media/thumbnail-placeholder',
      downloadUrl: `/api/v1/audio/${manifest.cameraId}/${manifest.requestId}/file`,
    }));
  }

  private sortKey(item: MediaItemDto): string {
    return `${item.capturedAt}|${item.id}`;
  }

  private parseLimit(value: number | undefined): number {
    if (value === undefined) return DEFAULT_LIMIT;
    if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${MAX_LIMIT}`,
      );
    }
    return value;
  }

  private decodeCursor(cursor: string | undefined): string | undefined {
    if (!cursor) return undefined;
    try {
      return Buffer.from(cursor, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('cursor is invalid');
    }
  }

  private encodeCursor(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
}

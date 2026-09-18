import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { MediaStorageService } from '../storage/media-storage.service';
import type {
  AudioThumbnailVariant,
  MediaResourceKind,
} from '../storage/storage.types';
import { assignDayCounters, withCounterSuffix } from './day-counter';
import type {
  MediaItemDto,
  MediaKind,
  MediaListQuery,
  MediaListResult,
} from './media-library.types';

const THUMBNAIL_PLACEHOLDER_URL = '/api/v1/media/thumbnail-placeholder';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const kindByResourceKind: Record<MediaResourceKind, MediaKind> = {
  captures: 'image',
  timelapses: 'timelapse',
  recordings: 'recording',
  live: 'live',
  audio: 'audio',
};

@Injectable()
export class MediaLibraryService {
  constructor(private readonly storage: MediaStorageService) {}

  /** Lists a single resource kind (captures/timelapses/recordings/audio), day-counter suffixed and cursor-paginated. */
  listKind(
    resourceKind: MediaResourceKind,
    query: MediaListQuery,
  ): MediaListResult {
    return this.paginate(this.itemsForKind(resourceKind), query);
  }

  /** Lists recordings + live merged (the dashboard's single "video" panel), per spec. */
  listVideo(query: MediaListQuery): MediaListResult {
    return this.paginate(
      [...this.itemsForKind('recordings'), ...this.itemsForKind('live')],
      query,
    );
  }

  private paginate(
    rawItems: MediaItemDto[],
    query: MediaListQuery,
  ): MediaListResult {
    const limit = this.parseLimit(query.limit);
    const filtered = rawItems.filter(
      (item) => !query.cameraId || item.cameraId === query.cameraId,
    );

    // Day-counter suffix must be computed over the FULL filtered set before
    // any cursor-based slicing, otherwise an item at a page boundary would
    // incorrectly restart its counter (e.g. the 21st item of the day
    // reading _001 instead of _021 just because it landed on page 2).
    const counters = assignDayCounters(filtered);
    const withSuffix = filtered.map((item) => ({
      ...item,
      fileName: withCounterSuffix(item.fileName, counters.get(item) ?? 1),
    }));

    const sorted = withSuffix.sort((left, right) =>
      this.sortKey(right).localeCompare(this.sortKey(left)),
    );

    const cursor = this.decodeCursor(query.cursor);
    const startIndex = cursor
      ? sorted.findIndex((item) => this.sortKey(item) === cursor)
      : 0;
    if (cursor && startIndex === -1) {
      throw new BadRequestException('cursor does not match any known item');
    }

    const page = sorted.slice(startIndex, startIndex + limit);
    const nextItem = sorted[startIndex + limit];
    return {
      items: page,
      nextCursor: nextItem
        ? this.encodeCursor(this.sortKey(nextItem))
        : undefined,
    };
  }

  private itemsForKind(resourceKind: MediaResourceKind): MediaItemDto[] {
    const kind = kindByResourceKind[resourceKind];
    return this.storage.listMetadata(resourceKind).map((metadata) => {
      const isAudio = resourceKind === 'audio';
      const darkPath = isAudio
        ? this.storage.audioThumbnailPath(
            metadata.cameraId,
            metadata.requestId,
            'dark',
          )
        : undefined;
      const lightPath = isAudio
        ? this.storage.audioThumbnailPath(
            metadata.cameraId,
            metadata.requestId,
            'light',
          )
        : undefined;

      return {
        id: `${kind}:${metadata.cameraId}:${metadata.requestId}`,
        kind,
        cameraId: metadata.cameraId,
        requestId: metadata.requestId,
        fileName: metadata.fileName,
        displayName: metadata.displayName,
        capturedAt: metadata.completedAt,
        durationSeconds: metadata.durationSeconds,
        frameCount: metadata.totalFrames,
        size: metadata.size,
        thumbnailUrl: isAudio
          ? this.thumbnailUrl(
              darkPath!,
              this.audioThumbnailUrl(
                metadata.cameraId,
                metadata.requestId,
                'dark',
              ),
            )
          : this.thumbnailUrl(
              this.storage.thumbnailPath(
                resourceKind,
                metadata.cameraId,
                metadata.requestId,
              ),
              `/api/v1/${resourceKind}/${metadata.cameraId}/${metadata.requestId}/thumbnail`,
            ),
        thumbnailUrlDark: isAudio
          ? this.thumbnailUrl(
              darkPath!,
              this.audioThumbnailUrl(
                metadata.cameraId,
                metadata.requestId,
                'dark',
              ),
            )
          : undefined,
        thumbnailUrlLight: isAudio
          ? this.thumbnailUrl(
              lightPath!,
              this.audioThumbnailUrl(
                metadata.cameraId,
                metadata.requestId,
                'light',
              ),
            )
          : undefined,
        downloadUrl: `/api/v1/${resourceKind}/${metadata.cameraId}/${metadata.requestId}/file`,
      } satisfies MediaItemDto;
    });
  }

  private audioThumbnailUrl(
    cameraId: string,
    requestId: string,
    variant: AudioThumbnailVariant,
  ): string {
    return `/api/v1/audio/${cameraId}/${requestId}/thumbnail?variant=${variant}`;
  }

  /** Real thumbnail URL if the sidecar file has already been generated, else the shared placeholder. */
  private thumbnailUrl(thumbnailPath: string, thumbnailUrl: string): string {
    return existsSync(thumbnailPath) ? thumbnailUrl : THUMBNAIL_PLACEHOLDER_URL;
  }

  deleteResource(
    resourceKind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    return this.storage.deleteResource(resourceKind, cameraId, requestId);
  }

  renameResource(
    resourceKind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    displayName: string,
  ): Promise<void> {
    return this.storage.renameResource(
      resourceKind,
      cameraId,
      requestId,
      displayName,
    );
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

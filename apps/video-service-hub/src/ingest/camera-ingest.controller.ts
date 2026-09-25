import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  assertFiniteNumber,
  assertInteger,
  assertMediaType,
  assertResolution,
  requireHeader,
} from '../common/validation';
import { JobRegistryService } from '../jobs/job-registry.service';
import { MediaStorageService } from '../storage/media-storage.service';
import type { MediaResourceKind } from '../storage/storage.types';
import { ThumbnailService } from '../thumbnails/thumbnail.service';
import { TranscodingService } from '../transcoding/transcoding.service';

@Controller('api/v1/cameras')
export class CameraIngestController {
  private readonly logger = new Logger(CameraIngestController.name);

  constructor(
    private readonly storage: MediaStorageService,
    private readonly thumbnails: ThumbnailService,
    private readonly transcoding: TranscodingService,
    private readonly jobs: JobRegistryService,
  ) {}

  @Post(':cameraId/captures/:requestId')
  async capture(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Headers('x-resolution') resolutionValue: string | undefined,
    @Headers('x-sha256') sha256Value: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'image/jpeg');
    const resolution = assertResolution(
      requireHeader(resolutionValue, 'X-Resolution'),
    );
    const result = await this.storage.storeCapture(
      request,
      cameraId,
      requestId,
      resolution,
      sha256Value,
    );
    await this.onPartStored('captures', cameraId, requestId, result);
    return result;
  }

  @Post(':cameraId/timelapses/:requestId/parts/:partNumber')
  async timelapsePart(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Param('partNumber') partNumberValue: string,
    @Headers('x-total-parts') totalPartsValue: string | undefined,
    @Headers('x-resolution') resolutionValue: string | undefined,
    @Headers('x-sha256') sha256Value: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'image/jpeg');
    const result = await this.storePart(
      request,
      'timelapses',
      cameraId,
      requestId,
      partNumberValue,
      totalPartsValue,
      sha256Value,
      {
        resolution: assertResolution(
          requireHeader(resolutionValue, 'X-Resolution'),
        ),
      },
    );
    await this.onPartStored('timelapses', cameraId, requestId, result);
    return result;
  }

  @Post(':cameraId/recordings/:requestId/parts/:partNumber')
  async recordingPart(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Param('partNumber') partNumberValue: string,
    @Headers('x-total-parts') totalPartsValue: string | undefined,
    @Headers('x-resolution') resolutionValue: string | undefined,
    @Headers('x-requested-duration-seconds') durationValue: string | undefined,
    @Headers('x-total-frames') totalFramesValue: string | undefined,
    @Headers('x-sha256') sha256Value: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'multipart/x-mixed-replace');
    const resolution = assertResolution(
      requireHeader(resolutionValue, 'X-Resolution'),
    );
    const durationSeconds = assertFiniteNumber(
      requireHeader(durationValue, 'X-Requested-Duration-Seconds'),
      'X-Requested-Duration-Seconds',
      0,
    );
    const totalFrames = assertInteger(
      requireHeader(totalFramesValue, 'X-Total-Frames'),
      'X-Total-Frames',
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const result = await this.storePart(
      request,
      'recordings',
      cameraId,
      requestId,
      partNumberValue,
      totalPartsValue,
      sha256Value,
      { resolution, durationSeconds, totalFrames },
    );
    await this.onPartStored('recordings', cameraId, requestId, result);
    return result;
  }

  @Post(':cameraId/audio/:requestId/parts/:partNumber')
  async audioPart(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Param('partNumber') partNumberValue: string,
    @Headers('x-total-parts') totalPartsValue: string | undefined,
    @Headers('x-duration-seconds') durationValue: string | undefined,
    @Headers('x-sha256') sha256Value: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'audio/wav');
    const durationSeconds = assertFiniteNumber(
      requireHeader(durationValue, 'X-Duration-Seconds'),
      'X-Duration-Seconds',
      Number.EPSILON,
    );
    const result = await this.storePart(
      request,
      'audio',
      cameraId,
      requestId,
      partNumberValue,
      totalPartsValue,
      sha256Value,
      { durationSeconds },
    );
    await this.onPartStored('audio', cameraId, requestId, result);
    return result;
  }

  @Post(':cameraId/live')
  @HttpCode(HttpStatus.OK)
  async live(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Headers('x-request-id') requestIdValue: string | undefined,
    @Headers('x-resolution') resolutionValue: string | undefined,
    @Headers('content-type') contentTypeValue: string | undefined,
  ): Promise<Record<string, unknown>> {
    const requestId = requireHeader(requestIdValue, 'X-Request-Id');
    const resolution = assertResolution(
      requireHeader(resolutionValue, 'X-Resolution'),
    );
    const contentType = assertMediaType(
      contentTypeValue,
      'multipart/x-mixed-replace',
    );
    const result = await this.storage.storeLive(
      request,
      cameraId,
      requestId,
      resolution,
      contentType,
    );
    if (result.stored) {
      await this.onPartStored('live', cameraId, requestId, result);
    }
    return result;
  }

  private async storePart(
    request: Request,
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    partNumberValue: string,
    totalPartsValue: string | undefined,
    sha256Value: string | undefined,
    extra: {
      resolution?: string;
      durationSeconds?: number;
      totalFrames?: number;
    },
  ): Promise<Record<string, unknown>> {
    const partNumber = assertInteger(
      partNumberValue,
      'partNumber',
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const totalParts = assertInteger(
      requireHeader(totalPartsValue, 'X-Total-Parts'),
      'X-Total-Parts',
      1,
      Number.MAX_SAFE_INTEGER,
    );
    return this.storage.storePart(request, kind, cameraId, requestId, {
      partNumber,
      totalParts,
      expectedSha256: sha256Value,
      ...extra,
    });
  }

  /**
   * Fires eager transcode + thumbnail generation the moment a resource's
   * manifest is complete. Both are best-effort/fire-and-forget from the
   * ingest request's point of view for thumbnails; transcode is awaited
   * since the client should only ever see the finished file.
   *
   * Also reports job completion to JobRegistryService: for every tracked
   * kind except captures (which complete on the initial command response,
   * see CameraCommandService.execute), this is the actual "done" signal --
   * finalize() having succeeded means the file is fully transcoded and
   * renamed. jobs.markDone/markFailed silently no-op for any requestId the
   * registry isn't tracking (untracked commands, or a job whose grace
   * period already expired), so this is safe to call unconditionally.
   */
  private async onPartStored(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    if (!result.complete) return;
    await this.transcoding
      .finalize(kind, cameraId, requestId)
      .then(() => {
        this.jobs.markDone(requestId);
      })
      .catch((error: Error) => {
        this.logger.error(
          `finalize failed for ${kind}/${cameraId}/${requestId}: ${error.message}`,
        );
        this.jobs.markFailed(requestId, error.message);
      });
    await this.generateThumbnail(kind, cameraId, requestId).catch(
      (error: Error) =>
        this.logger.warn(
          `thumbnail generation failed for ${kind}/${cameraId}/${requestId}: ${error.message}`,
        ),
    );
  }

  private async generateThumbnail(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    const metadata = this.storage.getMetadata(kind, cameraId, requestId);
    if (!metadata) return;
    const sourcePath = this.storage.finalFilePath(kind, cameraId, requestId);
    if (kind === 'audio') {
      await this.thumbnails.ensureWaveforms(sourcePath, {
        dark: this.storage.audioThumbnailPath(cameraId, requestId, 'dark'),
        light: this.storage.audioThumbnailPath(cameraId, requestId, 'light'),
      });
      return;
    }
    const thumbnailPath = this.storage.thumbnailPath(kind, cameraId, requestId);
    if (kind === 'captures') {
      await this.thumbnails.ensureFromImage(sourcePath, thumbnailPath);
      return;
    }
    // timelapses / recordings / live are all MP4 by the time metadata exists.
    await this.thumbnails.ensureFromMp4(sourcePath, thumbnailPath);
  }
}

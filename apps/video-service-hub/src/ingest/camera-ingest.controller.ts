import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamTokenGuard } from '../auth/stream-token.guard';
import { StreamTokenService } from '../auth/stream-token.service';
import {
  assertFiniteNumber,
  assertInteger,
  assertMediaType,
  assertResolution,
  requireHeader,
} from '../common/validation';
import { MediaStorageService } from '../storage/media-storage.service';
import { ThumbnailService } from '../thumbnails/thumbnail.service';

@Controller('api/v1/cameras')
export class CameraIngestController {
  private readonly logger = new Logger(CameraIngestController.name);

  constructor(
    private readonly storage: MediaStorageService,
    private readonly streamTokens: StreamTokenService,
    private readonly thumbnails: ThumbnailService,
  ) {}

  @Post(':cameraId/captures')
  async capture(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Headers('x-request-id') requestIdValue: string | undefined,
    @Headers('x-resolution') resolutionValue: string | undefined,
    @Headers('x-capture-sequence') sequenceValue: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    const requestId = requireHeader(requestIdValue, 'X-Request-Id');
    const resolution = assertResolution(
      requireHeader(resolutionValue, 'X-Resolution'),
    );
    assertMediaType(contentType, 'image/jpeg');
    const sequence =
      sequenceValue === undefined
        ? undefined
        : assertInteger(
            sequenceValue,
            'X-Capture-Sequence',
            0,
            Number.MAX_SAFE_INTEGER,
          );
    const result = await this.storage.storeCapture(
      request,
      cameraId,
      requestId,
      resolution,
      sequence,
    );
    await this.generateCaptureThumbnail(cameraId, requestId, result);
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
    @Headers('x-requested-duration-seconds')
    durationValue: string | undefined,
    @Headers('x-total-frames') totalFramesValue: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'multipart/x-mixed-replace');
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
    const resolution = assertResolution(
      requireHeader(resolutionValue, 'X-Resolution'),
    );
    const duration = assertFiniteNumber(
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
    const result = await this.storage.storeRecordingPart(
      request,
      cameraId,
      requestId,
      partNumber,
      totalParts,
      resolution,
      duration,
      totalFrames,
    );
    if (result.recordingComplete) {
      await this.generateRecordingThumbnail(cameraId, requestId);
    }
    return result;
  }

  @Post(':cameraId/audio')
  async audio(
    @Req() request: Request,
    @Param('cameraId') cameraId: string,
    @Headers('x-request-id') requestIdValue: string | undefined,
    @Headers('x-duration-seconds') durationValue: string | undefined,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<Record<string, unknown>> {
    assertMediaType(contentType, 'audio/wav');
    const requestId = requireHeader(requestIdValue, 'X-Request-Id');
    const duration = assertFiniteNumber(
      requireHeader(durationValue, 'X-Duration-Seconds'),
      'X-Duration-Seconds',
      Number.EPSILON,
    );
    const result = await this.storage.storeAudio(
      request,
      cameraId,
      requestId,
      duration,
    );
    await this.generateAudioThumbnail(cameraId, requestId);
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
      await this.generateRecordingThumbnail(cameraId, requestId);
    }
    return result;
  }

  @Get(':cameraId/live')
  @UseGuards(StreamTokenGuard)
  watchLive(
    @Param('cameraId') cameraId: string,
    @Query('requestId') requestId: string | undefined,
    @Query('streamToken') streamToken: string | undefined,
    @Res() response: Response,
  ): void {
    const viewer = this.storage.openLiveViewer(cameraId, requestId);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', viewer.contentType);
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Request-Id', viewer.requestId);
    response.flushHeaders();
    response.once('close', () => {
      viewer.stream.destroy();
      if (streamToken) {
        this.streamTokens.releaseViewer(streamToken);
      }
    });
    viewer.stream.pipe(response);
  }

  private async generateCaptureThumbnail(
    cameraId: string,
    requestId: string,
    stored: Record<string, unknown>,
  ): Promise<void> {
    const fileName = stored.fileName as string;
    const sourcePath = this.storage.captureFilePath(
      cameraId,
      requestId,
      fileName,
    );
    const thumbnailPath = this.storage.captureThumbnailPath(
      cameraId,
      requestId,
    );
    await this.thumbnails
      .ensureFromImage(sourcePath, thumbnailPath)
      .catch((error: Error) =>
        this.logger.warn(`capture thumbnail failed: ${error.message}`),
      );
  }

  private async generateRecordingThumbnail(
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    const thumbnailPath = this.storage.recordingThumbnailPath(
      cameraId,
      requestId,
    );
    let sourcePath: string;
    try {
      sourcePath = this.storage.recordingPartPaths(cameraId, requestId)[0];
    } catch {
      sourcePath = this.storage.liveRecordingFilePath(cameraId, requestId);
    }
    await this.thumbnails
      .ensureFromMjpeg(sourcePath, thumbnailPath)
      .catch((error: Error) =>
        this.logger.warn(`recording thumbnail failed: ${error.message}`),
      );
  }

  private async generateAudioThumbnail(
    cameraId: string,
    requestId: string,
  ): Promise<void> {
    const sourcePath = this.storage.audioFilePath(
      cameraId,
      `${requestId}.wav`,
    );
    await this.thumbnails
      .ensureWaveforms(sourcePath, {
        dark: this.storage.audioThumbnailPath(cameraId, requestId, 'dark'),
        light: this.storage.audioThumbnailPath(cameraId, requestId, 'light'),
      })
      .catch((error: Error) =>
        this.logger.warn(`audio thumbnail failed: ${error.message}`),
      );
  }
}

import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  assertFiniteNumber,
  assertInteger,
  assertMediaType,
  assertResolution,
  requireHeader,
} from '../common/validation';
import { MediaStorageService } from '../storage/media-storage.service';

@Controller('api/v1/cameras')
export class CameraIngestController {
  constructor(private readonly storage: MediaStorageService) {}

  @Post(':cameraId/captures')
  capture(
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
    return this.storage.storeCapture(
      request,
      cameraId,
      requestId,
      resolution,
      sequence,
    );
  }

  @Post(':cameraId/recordings/:requestId/parts/:partNumber')
  recordingPart(
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
    return this.storage.storeRecordingPart(
      request,
      cameraId,
      requestId,
      partNumber,
      totalParts,
      resolution,
      duration,
      totalFrames,
    );
  }

  @Post(':cameraId/audio')
  audio(
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
    return this.storage.storeAudio(request, cameraId, requestId, duration);
  }

  @Post(':cameraId/live')
  @HttpCode(HttpStatus.OK)
  live(
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
    return this.storage.storeLive(
      request,
      cameraId,
      requestId,
      resolution,
      contentType,
    );
  }

  @Get(':cameraId/live')
  watchLive(
    @Param('cameraId') cameraId: string,
    @Query('requestId') requestId: string | undefined,
    @Res() response: Response,
  ): void {
    const viewer = this.storage.openLiveViewer(cameraId, requestId);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', viewer.contentType);
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Request-Id', viewer.requestId);
    response.flushHeaders();
    response.once('close', () => viewer.stream.destroy());
    viewer.stream.pipe(response);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { MediaTokenGuard } from '../auth/media-token.guard';
import {
  assertDisplayName,
  assertIdentifier,
  assertSafeFileName,
} from '../common/validation';
import { MediaStorageService } from '../storage/media-storage.service';
import { MediaLibraryService } from './media-library.service';
import type { MediaKind } from './media-library.types';

const THUMBNAIL_PLACEHOLDER_PATH = join(
  __dirname,
  'assets',
  'thumbnail-placeholder.png',
);
const knownKinds = new Set<MediaKind>(['recording', 'image', 'audio']);

@Controller('api/v1')
export class MediaLibraryController {
  constructor(
    private readonly library: MediaLibraryService,
    private readonly storage: MediaStorageService,
  ) {}

  @Get('recordings')
  list(
    @Query('cameraId') cameraId: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    if (kind !== undefined && !knownKinds.has(kind as MediaKind)) {
      throw new NotFoundException('unsupported media kind');
    }
    return this.library.list({
      cameraId: cameraId ? assertIdentifier(cameraId, 'cameraId') : undefined,
      kind: kind as MediaKind | undefined,
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Get('media/thumbnail-placeholder')
  thumbnailPlaceholder(@Res() response: Response): void {
    if (!existsSync(THUMBNAIL_PLACEHOLDER_PATH)) {
      throw new NotFoundException('thumbnail placeholder is not available');
    }
    response.sendFile(THUMBNAIL_PLACEHOLDER_PATH);
  }

  @Get('captures/:cameraId/:requestId/frames')
  listCaptureFrames(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.library.listCaptureFrames(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @UseGuards(MediaTokenGuard)
  @Get('recordings/:cameraId/:requestId/file')
  async recordingFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): Promise<void> {
    const partPaths = this.storage.recordingPartPaths(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    response.setHeader('Content-Type', 'multipart/x-mixed-replace');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${requestId}.mjpeg"`,
    );
    for (const partPath of partPaths) {
      await pipeline(createReadStream(partPath), response, { end: false });
    }
    response.end();
  }

  @UseGuards(MediaTokenGuard)
  @Get('captures/:cameraId/:requestId/file')
  captureFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Query('fileName') fileName: string,
    @Res() response: Response,
  ): void {
    const filePath = this.storage.captureFilePath(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
      assertSafeFileName(fileName, 'fileName'),
    );
    this.sendIfExists(filePath, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('live-recordings/:cameraId/:requestId/file')
  liveRecordingFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    const filePath = this.storage.liveRecordingFilePath(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    this.sendIfExists(filePath, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('audio/:cameraId/:requestId/file')
  audioFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    const filePath = this.storage.audioFilePath(
      assertIdentifier(cameraId, 'cameraId'),
      `${assertIdentifier(requestId, 'requestId')}.wav`,
    );
    this.sendIfExists(filePath, response);
  }

  @Patch('recordings/:cameraId/:requestId')
  renameRecording(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.library.renameRecording(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
      assertDisplayName(body?.displayName),
    );
  }

  @Patch('captures/:cameraId/:requestId')
  renameCapture(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.library.renameCapture(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
      assertDisplayName(body?.displayName),
    );
  }

  @Patch('audio/:cameraId/:requestId')
  renameAudio(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.library.renameAudio(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
      assertDisplayName(body?.displayName),
    );
  }

  @HttpCode(204)
  @Delete('recordings/:cameraId/:requestId')
  deleteRecording(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.library.deleteRecording(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @HttpCode(204)
  @Delete('captures/:cameraId/:requestId')
  deleteCapture(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.library.deleteCapture(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @HttpCode(204)
  @Delete('audio/:cameraId/:requestId')
  deleteAudio(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.library.deleteAudio(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  private sendIfExists(filePath: string, response: Response): void {
    if (!existsSync(filePath)) {
      throw new NotFoundException('media file was not found');
    }
    response.sendFile(filePath);
  }
}

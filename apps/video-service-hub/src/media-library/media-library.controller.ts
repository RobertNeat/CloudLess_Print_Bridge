import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { MediaTokenGuard } from '../auth/media-token.guard';
import { StreamTokenGuard } from '../auth/stream-token.guard';
import { StreamTokenService } from '../auth/stream-token.service';
import { assertDisplayName, assertIdentifier } from '../common/validation';
import { MediaStorageService } from '../storage/media-storage.service';
import type { MediaResourceKind } from '../storage/storage.types';
import { MediaLibraryService } from './media-library.service';

const THUMBNAIL_PLACEHOLDER_PATH = join(
  __dirname,
  'assets',
  'thumbnail-placeholder.png',
);

@Controller('api/v1')
export class MediaLibraryController {
  constructor(
    private readonly library: MediaLibraryService,
    private readonly storage: MediaStorageService,
    private readonly streamTokens: StreamTokenService,
  ) {}

  @Get('live/:cameraId/:requestId/stream')
  @UseGuards(StreamTokenGuard)
  watchLive(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
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

  @Get('captures')
  listCaptures(@Query() query: Record<string, string | undefined>) {
    return this.library.listKind('captures', this.parseQuery(query));
  }

  @Get('timelapses')
  listTimelapses(@Query() query: Record<string, string | undefined>) {
    return this.library.listKind('timelapses', this.parseQuery(query));
  }

  @Get('video')
  listVideo(@Query() query: Record<string, string | undefined>) {
    return this.library.listVideo(this.parseQuery(query));
  }

  @Get('audio')
  listAudio(@Query() query: Record<string, string | undefined>) {
    return this.library.listKind('audio', this.parseQuery(query));
  }

  @Get('media/thumbnail-placeholder')
  thumbnailPlaceholder(@Res() response: Response): void {
    if (!existsSync(THUMBNAIL_PLACEHOLDER_PATH)) {
      throw new NotFoundException('thumbnail placeholder is not available');
    }
    response.sendFile(THUMBNAIL_PLACEHOLDER_PATH);
  }

  @Get('captures/:cameraId/:requestId/thumbnail')
  captureThumbnail(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendThumbnail('captures', cameraId, requestId, response);
  }

  @Get('timelapses/:cameraId/:requestId/thumbnail')
  timelapseThumbnail(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendThumbnail('timelapses', cameraId, requestId, response);
  }

  @Get('recordings/:cameraId/:requestId/thumbnail')
  recordingThumbnail(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendThumbnail('recordings', cameraId, requestId, response);
  }

  @Get('live/:cameraId/:requestId/thumbnail')
  liveThumbnail(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendThumbnail('live', cameraId, requestId, response);
  }

  @Get('audio/:cameraId/:requestId/thumbnail')
  audioThumbnail(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Query('variant') variant: string | undefined,
    @Res() response: Response,
  ): void {
    if (variant !== 'dark' && variant !== 'light') {
      throw new NotFoundException('unsupported thumbnail variant');
    }
    this.sendIfExists(
      this.storage.audioThumbnailPath(
        assertIdentifier(cameraId, 'cameraId'),
        assertIdentifier(requestId, 'requestId'),
        variant,
      ),
      response,
    );
  }

  @UseGuards(MediaTokenGuard)
  @Get('captures/:cameraId/:requestId/file')
  captureFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendFile('captures', cameraId, requestId, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('timelapses/:cameraId/:requestId/file')
  timelapseFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendFile('timelapses', cameraId, requestId, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('recordings/:cameraId/:requestId/file')
  recordingFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendFile('recordings', cameraId, requestId, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('live/:cameraId/:requestId/file')
  liveFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendFile('live', cameraId, requestId, response);
  }

  @UseGuards(MediaTokenGuard)
  @Get('audio/:cameraId/:requestId/file')
  audioFile(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    this.sendFile('audio', cameraId, requestId, response);
  }

  @Patch('captures/:cameraId/:requestId')
  renameCapture(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.rename('captures', cameraId, requestId, body);
  }

  @Patch('timelapses/:cameraId/:requestId')
  renameTimelapse(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.rename('timelapses', cameraId, requestId, body);
  }

  @Patch('recordings/:cameraId/:requestId')
  renameRecording(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.rename('recordings', cameraId, requestId, body);
  }

  @Patch('live/:cameraId/:requestId')
  renameLive(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.rename('live', cameraId, requestId, body);
  }

  @Patch('audio/:cameraId/:requestId')
  renameAudio(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Body() body: { displayName?: unknown },
  ) {
    return this.rename('audio', cameraId, requestId, body);
  }

  @HttpCode(204)
  @Delete('captures/:cameraId/:requestId')
  deleteCapture(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.delete('captures', cameraId, requestId);
  }

  @HttpCode(204)
  @Delete('timelapses/:cameraId/:requestId')
  deleteTimelapse(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.delete('timelapses', cameraId, requestId);
  }

  @HttpCode(204)
  @Delete('recordings/:cameraId/:requestId')
  deleteRecording(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.delete('recordings', cameraId, requestId);
  }

  @HttpCode(204)
  @Delete('live/:cameraId/:requestId')
  deleteLive(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.delete('live', cameraId, requestId);
  }

  @HttpCode(204)
  @Delete('audio/:cameraId/:requestId')
  deleteAudio(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.delete('audio', cameraId, requestId);
  }

  private parseQuery(query: Record<string, string | undefined>) {
    return {
      cameraId: query.cameraId
        ? assertIdentifier(query.cameraId, 'cameraId')
        : undefined,
      cursor: query.cursor,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
    };
  }

  private sendThumbnail(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    response: Response,
  ): void {
    this.sendIfExists(
      this.storage.thumbnailPath(
        kind,
        assertIdentifier(cameraId, 'cameraId'),
        assertIdentifier(requestId, 'requestId'),
      ),
      response,
    );
  }

  private sendFile(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    response: Response,
  ): void {
    const filePath = this.storage.finalFilePath(
      kind,
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    this.sendIfExists(filePath, response);
  }

  private rename(
    kind: MediaResourceKind,
    cameraId: string,
    requestId: string,
    body: { displayName?: unknown },
  ) {
    return this.library.renameResource(
      kind,
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
      assertDisplayName(body?.displayName),
    );
  }

  private delete(kind: MediaResourceKind, cameraId: string, requestId: string) {
    return this.library.deleteResource(
      kind,
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

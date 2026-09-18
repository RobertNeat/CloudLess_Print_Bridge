import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import type { Response } from 'express';
import { MediaTokenGuard } from '../auth/media-token.guard';
import { assertIdentifier } from '../common/validation';
import { TranscodingService } from './transcoding.service';

@Controller('api/v1')
export class TranscodingController {
  constructor(private readonly transcoding: TranscodingService) {}

  @Post('recordings/:cameraId/:requestId/transcode')
  transcode(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.transcoding.ensureMp4(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @UseGuards(MediaTokenGuard)
  @Get('recordings/:cameraId/:requestId/mp4')
  mp4(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    const filePath = this.transcoding.resolveMp4Path(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    if (!existsSync(filePath)) {
      throw new NotFoundException('transcoded recording was not found');
    }
    response.sendFile(filePath);
  }

  @Post('captures/:cameraId/:requestId/transcode')
  transcodeTimelapse(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.transcoding.ensureTimelapseMp4(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @UseGuards(MediaTokenGuard)
  @Get('captures/:cameraId/:requestId/mp4')
  timelapseMp4(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    const filePath = this.transcoding.resolveTimelapseMp4Path(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    if (!existsSync(filePath)) {
      throw new NotFoundException('transcoded timelapse was not found');
    }
    response.sendFile(filePath);
  }
}

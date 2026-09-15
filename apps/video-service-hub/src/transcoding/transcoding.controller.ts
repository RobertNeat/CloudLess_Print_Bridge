import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import type { Response } from 'express';
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
    return this.transcoding.transcodeRecordingToMp4(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
  }

  @Get('recordings/:cameraId/:requestId/mp4')
  mp4(
    @Param('cameraId') cameraId: string,
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ): void {
    const filePath = this.transcoding.mp4Path(
      assertIdentifier(cameraId, 'cameraId'),
      assertIdentifier(requestId, 'requestId'),
    );
    if (!existsSync(filePath)) {
      throw new NotFoundException('transcoded recording was not found');
    }
    response.sendFile(filePath);
  }
}

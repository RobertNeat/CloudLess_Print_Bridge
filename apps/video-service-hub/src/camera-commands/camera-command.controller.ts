import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CameraCommandService } from './camera-command.service';

@Controller('api/v1/cameras')
export class CameraCommandController {
  constructor(private readonly commandService: CameraCommandService) {}

  @Post(':cameraId/commands/:command')
  async command(
    @Param('cameraId') cameraId: string,
    @Param('command') command: string,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const result = await this.commandService.execute(cameraId, command, body);
    response.status(result.status);
    if (result.contentType) {
      response.setHeader('Content-Type', result.contentType);
    }
    return result.body;
  }
}

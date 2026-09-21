import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';
import { PrintJobThumbnailService } from './print-job-thumbnail.service';

@ApiTags('print-job')
@Controller('print_job')
export class PrintJobController {
  constructor(
    private readonly commands: CommandCatalogService,
    private readonly thumbnails: PrintJobThumbnailService,
  ) {}

  @Post('pause')
  @HttpCode(202)
  @ApiOperation({ summary: 'Pause the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  pause(@OperationId() operationId: string) {
    return this.commands.execute('pause-print', {}, operationId);
  }

  @Post('resume')
  @HttpCode(202)
  @ApiOperation({ summary: 'Resume the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  resume(@OperationId() operationId: string) {
    return this.commands.execute('resume-print', {}, operationId);
  }

  @Post('cancel')
  @HttpCode(202)
  @ApiOperation({ summary: 'Cancel the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  cancel(@OperationId() operationId: string) {
    return this.commands.execute('cancel-print', {}, operationId);
  }

  @Post('speed')
  @HttpCode(202)
  @ApiOperation({ summary: 'Set the speed mode of the current print job' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: {
          type: 'string',
          enum: ['silent', 'standard', 'sport', 'ludicrous'],
          example: 'standard',
        },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setSpeed(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-print-speed', parameters, operationId);
  }

  @Get('thumbnail')
  @ApiOperation({
    summary: "Get the active job's thumbnail PNG",
    description:
      "The id query parameter is the domain state's job.thumbnailId. " +
      'This endpoint does not require authentication, so it can be used ' +
      'directly as an <img src>.',
  })
  @ApiQuery({ name: 'id', required: true, example: '18047668811' })
  @ApiProduces('image/png')
  @ApiOkResponse({ description: 'PNG thumbnail bytes.' })
  @ApiNotFoundResponse({
    description: 'Unknown or not-yet-resolved thumbnail id.',
  })
  async getThumbnail(
    @Query('id') id: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const identifier = id?.trim();
    if (!identifier) throw new NotFoundException('Missing thumbnail id.');

    const image = await this.thumbnails.readThumbnail(identifier);
    if (!image) throw new NotFoundException('Unknown thumbnail id.');

    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    response.send(image);
  }
}

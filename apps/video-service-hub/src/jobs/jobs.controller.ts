import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Query,
} from '@nestjs/common';
import { assertIdentifier } from '../common/validation';
import { JobRegistryService } from './job-registry.service';
import type { JobDto, JobListResult } from './jobs.types';

@Controller('api/v1/jobs')
export class JobsController {
  constructor(private readonly registry: JobRegistryService) {}

  @Get()
  list(@Query('cameraId') cameraId: string | undefined): JobListResult {
    return {
      items: this.registry.list({
        cameraId: cameraId ? assertIdentifier(cameraId, 'cameraId') : undefined,
      }),
    };
  }

  @HttpCode(200)
  @Delete(':requestId')
  cancel(@Param('requestId') requestId: string): JobDto {
    return this.registry.cancel(assertIdentifier(requestId, 'requestId'));
  }
}

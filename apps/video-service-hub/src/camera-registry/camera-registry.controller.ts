import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CameraRegistryService } from './camera-registry.service';
import type { CameraRegistryInput } from './camera-registry.types';

@Controller('api/v1/camera-registry')
export class CameraRegistryController {
  constructor(private readonly registry: CameraRegistryService) {}

  @Get()
  list(): Record<string, unknown> {
    const items = this.registry.list();
    return { items, count: items.length };
  }

  @Get(':cameraId')
  get(@Param('cameraId') cameraId: string) {
    return this.registry.get(cameraId);
  }

  @Post(':cameraId')
  create(
    @Param('cameraId') cameraId: string,
    @Body() body: CameraRegistryInput,
  ) {
    return this.registry.create(cameraId, body);
  }

  @Patch(':cameraId')
  update(
    @Param('cameraId') cameraId: string,
    @Body() body: Partial<CameraRegistryInput>,
  ) {
    return this.registry.update(cameraId, body);
  }

  @Delete(':cameraId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('cameraId') cameraId: string): Promise<void> {
    await this.registry.remove(cameraId);
  }
}

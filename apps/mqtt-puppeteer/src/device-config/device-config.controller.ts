import { Controller, Get } from '@nestjs/common';
import { CommandCatalogService } from '../commands/command-catalog.service';

@Controller('device_config')
export class DeviceConfigController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Get('profile')
  getProfile() {
    return this.commands.getProfile();
  }
}

import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CommandCatalogService } from './command-catalog.service';

@Controller('commands')
export class CommandsController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Get()
  list() {
    return this.commands.list();
  }

  @Get('profile')
  getProfile() {
    return this.commands.getProfile();
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() parameters: unknown) {
    return { commandId: id, payload: this.commands.build(id, parameters) };
  }

  @Post(':id')
  @HttpCode(202)
  execute(@Param('id') id: string, @Body() parameters: unknown) {
    return this.commands.execute(id, parameters);
  }
}

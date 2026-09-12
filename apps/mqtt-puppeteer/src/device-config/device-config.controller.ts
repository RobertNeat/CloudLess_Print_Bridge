import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandCatalogService } from '../commands/command-catalog.service';

@ApiTags('device-config')
@Controller('device_config')
export class DeviceConfigController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Get the active printer profile identity and machine envelope',
    description:
      'Includes the AMS topology and the safe travel envelope (X/Y/Z ' +
      'minimum/maximum) for the currently active printer profile. A ' +
      'dashboard should use this to pre-validate jog input client-side, in ' +
      'addition to the server-side enforcement every command already gets.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'bambu-lab-a1' },
        topology: {
          type: 'object',
          properties: {
            unitCount: { type: 'number' },
            slotsPerUnit: { type: 'number' },
            externalSpool: { type: 'boolean' },
          },
        },
        machineEnvelope: {
          type: 'object',
          properties: {
            x: {
              type: 'object',
              properties: {
                minimum: { type: 'number' },
                maximum: { type: 'number' },
              },
            },
            y: {
              type: 'object',
              properties: {
                minimum: { type: 'number' },
                maximum: { type: 'number' },
              },
            },
            z: {
              type: 'object',
              properties: {
                minimum: { type: 'number' },
                maximum: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  getProfile() {
    return this.commands.getProfile();
  }
}

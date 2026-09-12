import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelemetryHistoryService } from './telemetry-history.service';

@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly history: TelemetryHistoryService) {}

  @Get('history')
  @ApiOperation({
    summary: 'Fetch the retained telemetry history buffer',
    description:
      'Returns up to `capacity` samples (progress, temperatures, fan speeds) ' +
      'captured from the printer domain model each time a status report is ' +
      'processed. Intended to seed dashboard charts on load.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        capacity: { type: 'number', example: 720 },
        samples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              capturedAt: { type: 'string', format: 'date-time' },
              progressPercent: { type: 'number', nullable: true },
              nozzleTemperatureCurrent: { type: 'number', nullable: true },
              nozzleTemperatureTarget: { type: 'number', nullable: true },
              bedTemperatureCurrent: { type: 'number', nullable: true },
              bedTemperatureTarget: { type: 'number', nullable: true },
              chamberTemperatureCurrent: { type: 'number', nullable: true },
              coolingFanPercent: { type: 'number', nullable: true },
              auxiliaryFanPercent: { type: 'number', nullable: true },
            },
          },
        },
      },
    },
  })
  getHistory() {
    return this.history.getHistory();
  }

  @Delete('history')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Clear the retained telemetry history buffer',
    description: 'Primarily useful for tests and manual troubleshooting.',
  })
  clearHistory(): void {
    this.history.clear();
  }
}

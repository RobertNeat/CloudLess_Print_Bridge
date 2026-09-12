import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Container liveness only — deliberately does not gate on MQTT connectivity.
 * The MQTT broker may be legitimately unreachable (no printer configured
 * yet, or it's mid-reconnect) without that meaning the HTTP server itself is
 * unhealthy; a Docker healthcheck (and octo-management-dashboard's
 * depends_on: condition: service_healthy) needs "is the process serving
 * requests", not "is the printer online" — see MqttTransportController's
 * /service/status for the latter.
 */
@ApiTags('service')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Liveness check — the HTTP server is up and responding',
  })
  @ApiOkResponse({
    description: 'Always ok when the process can serve this request.',
  })
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

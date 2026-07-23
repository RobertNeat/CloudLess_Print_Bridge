import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import {
  cameraCommandPaths,
  type CameraCommandResult,
} from './camera-command.types';
import {
  parseCameraBaseUrl,
  parseCameraCommand,
  validateCommandPayload,
} from './camera-command.validator';
import { assertIdentifier } from '../common/validation';

@Injectable()
export class CameraCommandService {
  private readonly logger = new Logger(CameraCommandService.name);

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

  async execute(
    cameraId: string,
    commandName: string,
    input: Record<string, unknown>,
  ): Promise<CameraCommandResult> {
    assertIdentifier(cameraId, 'cameraId');
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(
        'camera command body must be a JSON object',
      );
    }
    const command = parseCameraCommand(commandName);
    const cameraBaseUrl = parseCameraBaseUrl(input.cameraBaseUrl);
    const payload = validateCommandPayload(command, input);
    const url = `${cameraBaseUrl}${cameraCommandPaths[command]}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.cameraCommandTimeoutMs),
      });
      const contentType = response.headers.get('content-type') ?? undefined;
      const text = await response.text();
      let body: unknown = text || null;
      if (contentType?.toLowerCase().includes('application/json') && text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          this.logger.warn(
            `Camera ${cameraId} returned malformed JSON for ${command}`,
          );
        }
      }
      return { status: response.status, contentType, body };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Command ${command} for camera ${cameraId} failed: ${reason}`,
      );
      throw new BadGatewayException(`camera command failed: ${reason}`);
    }
  }
}

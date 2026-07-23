import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SERVICE_CONFIG } from './config/config.module';
import type { ServiceConfig } from './config/service-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get<ServiceConfig>(SERVICE_CONFIG);
  await app.listen(config.http.port, config.http.host);
  Logger.log(
    `Video Service Hub listening on http://${config.http.host}:${config.http.port}`,
    'Bootstrap',
  );
}

void bootstrap();

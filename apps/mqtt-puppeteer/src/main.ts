import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.enableCors({
    origin: config.http.corsOrigins,
    credentials: true,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('mqtt-puppeteer')
      .setDescription(
        'Local MQTT/TLS bridge that exposes a REST + WebSocket surface for ' +
          'the octo-management-dashboard to control and observe a 3D printer, ' +
          'without coupling the API shape to a specific printer model.',
      )
      .setVersion('0.0.1')
      .addBearerAuth()
      .addTag('commands', 'Generic, profile-driven command catalog')
      .addTag('movement', 'Axis jog / homing / extrusion shortcuts')
      .addTag('print-job', 'Print job lifecycle control')
      .addTag('filaments', 'Filament type/definition catalog')
      .addTag('filament-operations', 'AMS / external spool load-unload-define')
      .addTag('device-config', 'Active printer profile metadata')
      .addTag('printer-state', 'Merged and domain-mapped printer state')
      .addTag('telemetry', 'Bounded telemetry history for charts')
      .addTag('service', 'MQTT transport connection status')
      .addTag('auth', 'Cross-service bearer token issuance')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.http.port, config.http.host);
}
void bootstrap();

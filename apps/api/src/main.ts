import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';

async function bootstrap() {
  // Initialise Sentry before anything else so early crashes are captured (§9).
  const sentryOn = initSentry();

  // rawBody is required to verify the Clerk webhook signature (§6/§9).
  // bufferLogs so startup logs also flow through the pino logger once ready.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  // Route ALL Nest logs through structured, redacted pino (§9).
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`Guri API listening on http://localhost:${port} (sentry=${sentryOn ? 'on' : 'off'})`);
}

void bootstrap();

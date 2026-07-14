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
  // CORS allowlist: comma-separated so apex + www (e.g.
  // "https://getguri.com,https://www.getguri.com") both pass.
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  });

  // Railway (and most PaaS) inject PORT and route public traffic to it; fall
  // back to API_PORT / 4000 for local dev. Bind 0.0.0.0 so the container is
  // reachable from the platform's proxy.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  const logger = app.get(Logger);
  logger.log(`Guri API listening on http://localhost:${port} (sentry=${sentryOn ? 'on' : 'off'})`);
}

void bootstrap();

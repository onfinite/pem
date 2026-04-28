import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

/**
 * HTTP layer: JSON body (+ raw body for Svix), CORS, validation.
 * Call after `NestFactory.create(..., { bodyParser: false })`.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(
    express.json({
      limit: '5mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const config = app.get(ConfigService);
  const origins = config.get<string[]>('cors.origins');
  if (!Array.isArray(origins) || origins.length === 0) {
    throw new Error(
      'CORS origins must be configured: set ALLOWED_ORIGINS to a comma-separated list (see .env.example).',
    );
  }
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
}

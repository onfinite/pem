import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

import { setupSwagger } from './swagger.setup';

/**
 * HTTP layer: JSON body (+ raw body for Svix), CORS, validation, OpenAPI.
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
  app.enableCors({
    origin: config.get<string[]>('cors.origins') ?? true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
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

  setupSwagger(app, config);
}

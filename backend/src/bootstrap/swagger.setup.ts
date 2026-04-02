import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Swagger UI at `/docs`, spec at `/docs-json`. Disabled in production. */
export function setupSwagger(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  if (config.get<string>('env') === 'prod') {
    return;
  }

  const builder = new DocumentBuilder()
    .setTitle('PEM API')
    .setDescription('Pem HTTP API')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Clerk session JWT',
      },
      'clerk',
    )
    .build();

  const document = SwaggerModule.createDocument(app, builder);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** Local dev servers are frequently reached via 127.0.0.1 or an alternate port; keep prod strict. */
function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isDevProtocol = url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'capacitor:';
    return isLocalHost && isDevProtocol;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Read after NestFactory.create(): ConfigModule.forRoot() loads .env during module resolution.
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  app.useBodyParser('json', { limit: '4mb' }); // resume drafts may carry a few small cropped images (doc 16)
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || configuredOrigins.includes(origin) || (isDev && isLocalDevOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const doc = SwaggerModule.createDocument(app,
    new DocumentBuilder().setTitle('XCron CV API').setVersion('0.1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc); // OpenAPI JSON at /api/docs-json -> generate packages/sdk from it

  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();

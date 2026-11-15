import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '4mb' }); // resume drafts may carry a few small cropped images (doc 16)
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const doc = SwaggerModule.createDocument(app,
    new DocumentBuilder().setTitle('XCron CV API').setVersion('0.1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc); // OpenAPI JSON at /api/docs-json -> generate packages/sdk from it

  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);

  const isProd = configService.get<string>('NODE_ENV') === 'production';

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false, // отключаем CSP в dev, чтобы не ломать Swagger UI
      crossOriginEmbedderPolicy: isProd,
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Request size limits
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Раздача загруженных файлов (только в development; в production используйте S3 signed URLs)
  if (!isProd) {
    app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  }

  // CORS — разрешаем запросы от мобильного приложения и веб-клиента
  // React Native не отправляет Origin header, поэтому в dev разрешаем все
  const allowedOrigins = configService.get<string>('CORS_ORIGINS', '');
  if (isProd && !allowedOrigins) {
    throw new Error('CORS_ORIGINS must be set in production');
  }
  app.enableCors({
    origin: allowedOrigins
      ? allowedOrigins.split(',').map((o) => o.trim())
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger — только в development
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BookScanner API')
      .setDescription('API для системы создания карточек б/у книг для маркетплейсов')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('BACKEND_PORT', 3000);
  await app.listen(port);
  console.log(`BookScanner API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();

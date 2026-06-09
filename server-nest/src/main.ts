import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // 安全中间件
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // 全局CORS（由 CorsModule 统一管理）
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API 前缀
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });

  // Swagger 文档（非生产环境）
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Dice Cat Boardgame Ops API')
      .setDescription('骰子猫桌游馆运营工作台 - 企业级 API')
      .setVersion('1.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // 向后兼容：/api/* 路径也响应（NestJS 控制器用 /api/v1 前缀）
  const port = Number(process.env.PORT || 9898);
  await app.listen(port);
  Logger.log(`🚀 API http://localhost:${port}`, 'Bootstrap');
  if (process.env.NODE_ENV !== 'production') {
    Logger.log(`📖 Swagger http://localhost:${port}/api/docs`, 'Bootstrap');
  }
}

bootstrap();

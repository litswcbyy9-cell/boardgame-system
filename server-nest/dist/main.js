"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const compression = require("compression");
const helmet_1 = require("helmet");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
    app.use(compression());
    app.enableCors({
        origin: process.env.CORS_ORIGIN?.split(',') || true,
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    if (process.env.NODE_ENV !== 'production') {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('Dice Cat Boardgame Ops API')
            .setDescription('骰子猫桌游馆运营工作台 - 企业级 API')
            .setVersion('1.1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
    const port = Number(process.env.PORT || 9898);
    await app.listen(port);
    common_1.Logger.log(`🚀 API http://localhost:${port}`, 'Bootstrap');
    if (process.env.NODE_ENV !== 'production') {
        common_1.Logger.log(`📖 Swagger http://localhost:${port}/api/docs`, 'Bootstrap');
    }
}
bootstrap();
//# sourceMappingURL=main.js.map
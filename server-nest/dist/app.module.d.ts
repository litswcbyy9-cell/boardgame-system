import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TenantService } from './common/services/tenant.service';
export declare class AppModule implements NestModule {
    private tenantService;
    constructor(tenantService: TenantService);
    onModuleInit(): Promise<void>;
    configure(consumer: MiddlewareConsumer): void;
}

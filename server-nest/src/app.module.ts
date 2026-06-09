import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { MembersModule } from './modules/members/members.module';
import { GamesModule } from './modules/games/games.module';
import { TablesModule } from './modules/tables/tables.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditMiddleware } from './common/interceptors/audit.interceptor';
import { RequestIdMiddleware } from './common/interceptors/request-id.interceptor';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantService } from './common/services/tenant.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    StaffModule,
    MembersModule,
    GamesModule,
    TablesModule,
    ReservationsModule,
    SessionsModule,
    ReportsModule,
    RecommendationsModule,
    MarketingModule,
    BillingModule,
  ],
  providers: [TenantService],
})
export class AppModule implements NestModule {
  constructor(private tenantService: TenantService) {}

  async onModuleInit() {
    // 初始化默认租户
    await this.tenantService.createDefaultTenant();
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware, RequestIdMiddleware, AuditMiddleware).forRoutes('*');
  }
}



"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("./config/config.module");
const prisma_module_1 = require("./shared/prisma/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const staff_module_1 = require("./modules/staff/staff.module");
const members_module_1 = require("./modules/members/members.module");
const games_module_1 = require("./modules/games/games.module");
const tables_module_1 = require("./modules/tables/tables.module");
const reservations_module_1 = require("./modules/reservations/reservations.module");
const sessions_module_1 = require("./modules/sessions/sessions.module");
const reports_module_1 = require("./modules/reports/reports.module");
const recommendations_module_1 = require("./modules/recommendations/recommendations.module");
const marketing_module_1 = require("./modules/marketing/marketing.module");
const billing_module_1 = require("./modules/billing/billing.module");
const audit_interceptor_1 = require("./common/interceptors/audit.interceptor");
const request_id_interceptor_1 = require("./common/interceptors/request-id.interceptor");
const tenant_middleware_1 = require("./common/middleware/tenant.middleware");
const tenant_service_1 = require("./common/services/tenant.service");
let AppModule = class AppModule {
    constructor(tenantService) {
        this.tenantService = tenantService;
    }
    async onModuleInit() {
        await this.tenantService.createDefaultTenant();
    }
    configure(consumer) {
        consumer.apply(tenant_middleware_1.TenantMiddleware, request_id_interceptor_1.RequestIdMiddleware, audit_interceptor_1.AuditMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            staff_module_1.StaffModule,
            members_module_1.MembersModule,
            games_module_1.GamesModule,
            tables_module_1.TablesModule,
            reservations_module_1.ReservationsModule,
            sessions_module_1.SessionsModule,
            reports_module_1.ReportsModule,
            recommendations_module_1.RecommendationsModule,
            marketing_module_1.MarketingModule,
            billing_module_1.BillingModule,
        ],
        providers: [tenant_service_1.TenantService],
    }),
    __metadata("design:paramtypes", [tenant_service_1.TenantService])
], AppModule);
//# sourceMappingURL=app.module.js.map
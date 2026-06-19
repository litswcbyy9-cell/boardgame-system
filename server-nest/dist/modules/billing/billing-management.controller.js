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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingManagementController = void 0;
const common_1 = require("@nestjs/common");
const billing_service_1 = require("./billing.service");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let BillingManagementController = class BillingManagementController {
    constructor(billingService, prisma) {
        this.billingService = billingService;
        this.prisma = prisma;
    }
    async listOrders(req, venueId, skip = '0', take = '20') {
        const tenantId = req.tenant.id;
        const whereClause = { tenantId };
        if (venueId)
            whereClause.venueId = parseInt(venueId);
        const orders = await this.prisma.order.findMany({
            where: whereClause,
            include: {
                player: { select: { displayName: true, phone: true } },
                items: true,
            },
            orderBy: { createdAt: 'desc' },
            skip: parseInt(skip),
            take: parseInt(take),
        });
        const total = await this.prisma.order.count({ where: whereClause });
        return {
            data: orders,
            pagination: { skip: parseInt(skip), take: parseInt(take), total },
        };
    }
    async getOrder(req, orderId) {
        const tenantId = req.tenant.id;
        return this.billingService.getOrder(tenantId, parseInt(orderId));
    }
    async markOrderAsPaid(req, orderId) {
        const tenantId = req.tenant.id;
        return this.billingService.markOrderAsPaid(tenantId, parseInt(orderId));
    }
    async getOrderStats(req, venueId) {
        const tenantId = req.tenant.id;
        return this.billingService.getOrderStats(tenantId, venueId ? parseInt(venueId) : undefined);
    }
    async getRevenueTrend(req, days = '30') {
        const tenantId = req.tenant.id;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - parseInt(days));
        const orders = await this.prisma.order.findMany({
            where: {
                tenantId,
                status: 'paid',
                paidAt: { gte: sinceDate },
            },
            include: { items: true },
        });
        const dailyRevenue = {};
        orders.forEach(order => {
            const date = order.paidAt?.toISOString().split('T')[0];
            if (date) {
                dailyRevenue[date] = (dailyRevenue[date] || 0) + order.finalCents;
            }
        });
        return {
            days: parseInt(days),
            dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({
                date,
                amountCents: amount,
                amountYuan: Math.floor(amount / 100),
            })),
            totalRevenue: orders.reduce((sum, o) => sum + o.finalCents, 0),
        };
    }
};
exports.BillingManagementController = BillingManagementController;
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('venueId')),
    __param(2, (0, common_1.Query)('skip')),
    __param(3, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], BillingManagementController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingManagementController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/pay'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingManagementController.prototype, "markOrderAsPaid", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('venueId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingManagementController.prototype, "getOrderStats", null);
__decorate([
    (0, common_1.Get)('revenue-trend'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingManagementController.prototype, "getRevenueTrend", null);
exports.BillingManagementController = BillingManagementController = __decorate([
    (0, common_1.Controller)('billing-mgmt'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [billing_service_1.BillingService,
        prisma_service_1.PrismaService])
], BillingManagementController);
//# sourceMappingURL=billing-management.controller.js.map
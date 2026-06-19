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
exports.CouponManagementController = void 0;
const common_1 = require("@nestjs/common");
const coupon_service_1 = require("./coupon.service");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const create_coupon_dto_1 = require("./dto/create-coupon.dto");
let CouponManagementController = class CouponManagementController {
    constructor(couponService, prisma) {
        this.couponService = couponService;
        this.prisma = prisma;
    }
    async createCoupon(req, dto) {
        const tenantId = req.tenant.id;
        return this.couponService.createCoupon(tenantId, {
            name: dto.name,
            type: dto.type,
            value: dto.value,
            minAmount: dto.minAmount,
            totalQty: dto.totalQty,
            startAt: new Date(dto.startAt),
            endAt: new Date(dto.endAt),
            validOn: dto.validOn,
        });
    }
    async listCoupons(req, skip = '0', take = '20') {
        const tenantId = req.tenant.id;
        const coupons = await this.prisma.coupon.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            skip: parseInt(skip),
            take: parseInt(take),
        });
        const total = await this.prisma.coupon.count({ where: { tenantId } });
        return {
            data: coupons,
            pagination: { skip: parseInt(skip), take: parseInt(take), total },
        };
    }
    async getCouponStats(req, couponId) {
        const tenantId = req.tenant.id;
        return this.couponService.getCouponStats(tenantId, parseInt(couponId));
    }
    async issueCoupon(req, couponId, playerId) {
        const tenantId = req.tenant.id;
        return this.couponService.issueCoupon(tenantId, parseInt(couponId), parseInt(playerId));
    }
    async getMemberCoupons(req, couponId) {
        const tenantId = req.tenant.id;
        return this.prisma.memberCoupon.findMany({
            where: {
                couponId: parseInt(couponId),
                coupon: { tenantId },
            },
            include: { player: { select: { displayName: true, phone: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }
};
exports.CouponManagementController = CouponManagementController;
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_coupon_dto_1.CreateCouponDto]),
    __metadata("design:returntype", Promise)
], CouponManagementController.prototype, "createCoupon", null);
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('skip')),
    __param(2, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CouponManagementController.prototype, "listCoupons", null);
__decorate([
    (0, common_1.Get)(':id/stats'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CouponManagementController.prototype, "getCouponStats", null);
__decorate([
    (0, common_1.Post)(':couponId/issue/:playerId'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('couponId')),
    __param(2, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CouponManagementController.prototype, "issueCoupon", null);
__decorate([
    (0, common_1.Get)(':id/member-coupons'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CouponManagementController.prototype, "getMemberCoupons", null);
exports.CouponManagementController = CouponManagementController = __decorate([
    (0, common_1.Controller)('coupons-mgmt'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [coupon_service_1.CouponService,
        prisma_service_1.PrismaService])
], CouponManagementController);
//# sourceMappingURL=coupon-management.controller.js.map
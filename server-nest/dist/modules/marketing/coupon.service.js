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
exports.CouponService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let CouponService = class CouponService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createCoupon(tenantId, data) {
        return this.prisma.coupon.create({
            data: {
                tenantId,
                name: data.name,
                type: data.type,
                value: data.value,
                minAmount: data.minAmount || 0,
                totalQty: data.totalQty,
                startAt: data.startAt,
                endAt: data.endAt,
                validOn: data.validOn || 'all',
            },
        });
    }
    async issueCoupon(tenantId, couponId, playerId) {
        const coupon = await this.prisma.coupon.findFirst({
            where: {
                id: couponId,
                tenantId,
            },
        });
        if (!coupon)
            throw new Error('Coupon not found');
        if (coupon.usedQty >= coupon.totalQty) {
            throw new Error('Coupon exhausted');
        }
        const now = new Date();
        if (now < coupon.startAt || now > coupon.endAt) {
            throw new Error('Coupon not in valid period');
        }
        const existing = await this.prisma.memberCoupon.findUnique({
            where: {
                playerId_couponId: {
                    playerId,
                    couponId,
                },
            },
        });
        if (existing && existing.status !== 'expired') {
            throw new Error('Already issued to this member');
        }
        await this.prisma.coupon.update({
            where: { id: couponId },
            data: {
                usedQty: {
                    increment: 1,
                },
            },
        });
        if (existing) {
            return this.prisma.memberCoupon.update({
                where: {
                    playerId_couponId: {
                        playerId,
                        couponId,
                    },
                },
                data: {
                    status: 'unused',
                },
            });
        }
        return this.prisma.memberCoupon.create({
            data: {
                playerId,
                couponId,
                status: 'unused',
            },
        });
    }
    async getMemberAvailableCoupons(tenantId, playerId) {
        const now = new Date();
        return this.prisma.memberCoupon.findMany({
            where: {
                playerId,
                status: 'unused',
                coupon: {
                    tenantId,
                    startAt: { lte: now },
                    endAt: { gte: now },
                },
            },
            include: {
                coupon: true,
            },
            orderBy: {
                coupon: { value: 'desc' },
            },
        });
    }
    async calculateOptimalDiscount(tenantId, playerId, amountCents) {
        const coupons = await this.getMemberAvailableCoupons(tenantId, playerId);
        let bestDiscount = null;
        let maxSavings = 0;
        for (const mc of coupons) {
            const coupon = mc.coupon;
            if (amountCents < coupon.minAmount)
                continue;
            let discount = 0;
            if (coupon.type === 'discount_fixed') {
                discount = coupon.value;
            }
            else if (coupon.type === 'discount_percent') {
                discount = Math.floor((amountCents * coupon.value) / 10000);
            }
            if (discount > maxSavings) {
                maxSavings = discount;
                bestDiscount = {
                    couponId: coupon.id,
                    discountCents: discount,
                    reason: coupon.name,
                };
            }
        }
        return bestDiscount;
    }
    async useCoupon(tenantId, playerId, couponId) {
        const mc = await this.prisma.memberCoupon.findUnique({
            where: {
                playerId_couponId: {
                    playerId,
                    couponId,
                },
            },
            include: {
                coupon: true,
            },
        });
        if (!mc || mc.coupon.tenantId !== tenantId) {
            throw new Error('Member coupon not found');
        }
        if (mc.status !== 'unused') {
            throw new Error('Coupon already used or expired');
        }
        return this.prisma.memberCoupon.update({
            where: {
                playerId_couponId: {
                    playerId,
                    couponId,
                },
            },
            data: {
                status: 'used',
                usedAt: new Date(),
            },
        });
    }
    async getCouponStats(tenantId, couponId) {
        const coupon = await this.prisma.coupon.findFirst({
            where: {
                id: couponId,
                tenantId,
            },
            include: {
                memberCoupons: {
                    select: {
                        status: true,
                    },
                },
            },
        });
        if (!coupon)
            return null;
        const stats = {
            ...coupon,
            issuedCount: coupon.memberCoupons.length,
            usedCount: coupon.memberCoupons.filter(mc => mc.status === 'used').length,
            conversionRate: coupon.memberCoupons.length > 0
                ? (coupon.memberCoupons.filter(mc => mc.status === 'used').length / coupon.memberCoupons.length * 100).toFixed(2)
                : '0',
        };
        return stats;
    }
};
exports.CouponService = CouponService;
exports.CouponService = CouponService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CouponService);
//# sourceMappingURL=coupon.service.js.map
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
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const coupon_service_1 = require("../marketing/coupon.service");
const member_service_1 = require("../members/member.service");
const uuid_1 = require("uuid");
let BillingService = class BillingService {
    constructor(prisma, couponService, memberService) {
        this.prisma = prisma;
        this.couponService = couponService;
        this.memberService = memberService;
    }
    async createOrder(tenantId, venueId, items, playerId) {
        const orderNo = `ORD-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8)}`;
        let subtotal = 0;
        const orderItems = [];
        for (const item of items) {
            const total = item.quantity * item.unitPrice;
            subtotal += total;
            orderItems.push({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: total,
                gameId: item.gameId,
                sessionId: item.sessionId,
            });
        }
        let membershipDiscount = 0;
        let couponDiscount = 0;
        let appliedCouponId;
        if (playerId) {
            const player = await this.prisma.player.findUnique({
                where: { id: playerId },
            });
            if (player && player.tenantId === tenantId) {
                const discountRate = await this.memberService.getDiscountRate(tenantId, playerId);
                membershipDiscount = Math.floor((subtotal * (10000 - discountRate)) / 10000);
                const coupon = await this.couponService.calculateOptimalDiscount(tenantId, playerId, subtotal - membershipDiscount);
                if (coupon) {
                    couponDiscount = coupon.discountCents;
                    appliedCouponId = coupon.couponId;
                }
            }
        }
        const totalDiscount = membershipDiscount + couponDiscount;
        const finalAmount = Math.max(0, subtotal - totalDiscount);
        const order = await this.prisma.order.create({
            data: {
                tenantId,
                venueId,
                playerId,
                orderNo,
                amountCents: subtotal,
                discountCents: totalDiscount,
                finalCents: finalAmount,
                status: 'pending',
                items: {
                    create: orderItems,
                },
            },
        });
        if (appliedCouponId && playerId) {
            await this.couponService.useCoupon(tenantId, playerId, appliedCouponId);
        }
        return {
            orderId: order.id,
            orderNo: order.orderNo,
            subtotalCents: subtotal,
            discountCents: totalDiscount,
            finalCents: finalAmount,
            appliedCoupon: appliedCouponId
                ? { couponId: appliedCouponId, reason: '最优优惠' }
                : undefined,
        };
    }
    async getOrder(tenantId, orderId) {
        return this.prisma.order.findFirst({
            where: {
                id: orderId,
                tenantId,
            },
            include: {
                items: true,
                player: {
                    select: {
                        id: true,
                        displayName: true,
                        phone: true,
                    },
                },
            },
        });
    }
    async getOrderByNo(tenantId, orderNo) {
        return this.prisma.order.findFirst({
            where: {
                orderNo,
                tenantId,
            },
            include: {
                items: true,
                player: true,
            },
        });
    }
    async markOrderAsPaid(tenantId, orderId) {
        const order = await this.getOrder(tenantId, orderId);
        if (!order)
            throw new Error('Order not found');
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'paid',
                paidAt: new Date(),
            },
        });
        if (order.playerId) {
            await this.prisma.player.update({
                where: { id: order.playerId },
                data: {
                    totalSpentCents: {
                        increment: order.finalCents,
                    },
                },
            });
            const pointsToAdd = Math.floor(order.finalCents / 100);
            if (pointsToAdd > 0) {
                await this.memberService.addPoints(tenantId, order.playerId, pointsToAdd, 'consume', `订单 ${order.orderNo} 消费`);
            }
            await this.memberService.updateMembershipLevel(tenantId, order.playerId);
        }
        return updated;
    }
    async cancelOrder(tenantId, orderId) {
        const order = await this.getOrder(tenantId, orderId);
        if (!order)
            throw new Error('Order not found');
        if (order.status === 'paid') {
            throw new Error('Cannot cancel paid order');
        }
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'cancelled',
            },
        });
    }
    async getOrderStats(tenantId, venueId) {
        const whereClause = { tenantId };
        if (venueId)
            whereClause.venueId = venueId;
        const orders = await this.prisma.order.findMany({
            where: whereClause,
        });
        const paidOrders = orders.filter(o => o.status === 'paid');
        return {
            totalOrders: orders.length,
            paidOrders: paidOrders.length,
            totalRevenue: paidOrders.reduce((sum, o) => sum + o.finalCents, 0),
            totalDiscount: paidOrders.reduce((sum, o) => sum + o.discountCents, 0),
            avgOrderValue: paidOrders.length > 0
                ? Math.floor(paidOrders.reduce((sum, o) => sum + o.finalCents, 0) / paidOrders.length)
                : 0,
        };
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        coupon_service_1.CouponService,
        member_service_1.MemberService])
], BillingService);
//# sourceMappingURL=billing.service.js.map
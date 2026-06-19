import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponType } from '@prisma/client';
interface CouponCalculationResult {
    couponId: number;
    discountCents: number;
    reason: string;
}
export declare class CouponService {
    private prisma;
    constructor(prisma: PrismaService);
    createCoupon(tenantId: number, data: {
        name: string;
        type: CouponType;
        value: number;
        minAmount?: number;
        totalQty: number;
        startAt: Date;
        endAt: Date;
        validOn?: 'weekday' | 'weekend' | 'all';
    }): Promise<{
        name: string;
        type: import(".prisma/client").$Enums.CouponType;
        id: number;
        tenantId: number;
        createdAt: Date;
        startAt: Date;
        endAt: Date;
        value: number;
        minAmount: number;
        totalQty: number;
        usedQty: number;
        validOn: import(".prisma/client").$Enums.CouponValidOn;
    }>;
    issueCoupon(tenantId: number, couponId: number, playerId: number): Promise<{
        id: bigint;
        status: import(".prisma/client").$Enums.MemberCouponStatus;
        createdAt: Date;
        playerId: number;
        couponId: number;
        usedAt: Date | null;
    }>;
    getMemberAvailableCoupons(tenantId: number, playerId: number): Promise<({
        coupon: {
            name: string;
            type: import(".prisma/client").$Enums.CouponType;
            id: number;
            tenantId: number;
            createdAt: Date;
            startAt: Date;
            endAt: Date;
            value: number;
            minAmount: number;
            totalQty: number;
            usedQty: number;
            validOn: import(".prisma/client").$Enums.CouponValidOn;
        };
    } & {
        id: bigint;
        status: import(".prisma/client").$Enums.MemberCouponStatus;
        createdAt: Date;
        playerId: number;
        couponId: number;
        usedAt: Date | null;
    })[]>;
    calculateOptimalDiscount(tenantId: number, playerId: number, amountCents: number): Promise<CouponCalculationResult | null>;
    useCoupon(tenantId: number, playerId: number, couponId: number): Promise<{
        id: bigint;
        status: import(".prisma/client").$Enums.MemberCouponStatus;
        createdAt: Date;
        playerId: number;
        couponId: number;
        usedAt: Date | null;
    }>;
    getCouponStats(tenantId: number, couponId: number): Promise<{
        issuedCount: number;
        usedCount: number;
        conversionRate: string;
        memberCoupons: {
            status: import(".prisma/client").$Enums.MemberCouponStatus;
        }[];
        name: string;
        type: import(".prisma/client").$Enums.CouponType;
        id: number;
        tenantId: number;
        createdAt: Date;
        startAt: Date;
        endAt: Date;
        value: number;
        minAmount: number;
        totalQty: number;
        usedQty: number;
        validOn: import(".prisma/client").$Enums.CouponValidOn;
    } | null>;
}
export {};

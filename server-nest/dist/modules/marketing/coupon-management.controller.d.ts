import { CouponService } from './coupon.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
export declare class CouponManagementController {
    private couponService;
    private prisma;
    constructor(couponService: CouponService, prisma: PrismaService);
    createCoupon(req: any, dto: CreateCouponDto): Promise<{
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
    listCoupons(req: any, skip?: string, take?: string): Promise<{
        data: {
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
        }[];
        pagination: {
            skip: number;
            take: number;
            total: number;
        };
    }>;
    getCouponStats(req: any, couponId: string): Promise<{
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
    issueCoupon(req: any, couponId: string, playerId: string): Promise<{
        id: bigint;
        status: import(".prisma/client").$Enums.MemberCouponStatus;
        createdAt: Date;
        playerId: number;
        couponId: number;
        usedAt: Date | null;
    }>;
    getMemberCoupons(req: any, couponId: string): Promise<({
        player: {
            displayName: string;
            phone: string | null;
        };
    } & {
        id: bigint;
        status: import(".prisma/client").$Enums.MemberCouponStatus;
        createdAt: Date;
        playerId: number;
        couponId: number;
        usedAt: Date | null;
    })[]>;
}

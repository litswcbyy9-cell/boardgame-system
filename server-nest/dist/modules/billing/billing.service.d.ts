import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponService } from '../marketing/coupon.service';
import { MemberService } from '../members/member.service';
interface BillingLineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    gameId?: number;
    sessionId?: number;
}
interface BillingResult {
    orderId: number;
    orderNo: string;
    subtotalCents: number;
    discountCents: number;
    finalCents: number;
    appliedCoupon?: {
        couponId: number;
        reason: string;
    };
}
export declare class BillingService {
    private prisma;
    private couponService;
    private memberService;
    constructor(prisma: PrismaService, couponService: CouponService, memberService: MemberService);
    createOrder(tenantId: number, venueId: number, items: BillingLineItem[], playerId?: number): Promise<BillingResult>;
    getOrder(tenantId: number, orderId: number): Promise<({
        player: {
            displayName: string;
            id: number;
            phone: string | null;
        } | null;
        items: {
            description: string;
            id: bigint;
            sessionId: number | null;
            gameId: number | null;
            quantity: number;
            unitPrice: number;
            totalPrice: number;
            orderId: number;
        }[];
    } & {
        id: number;
        tenantId: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        createdAt: Date;
        playerId: number | null;
        venueId: number;
        amountCents: number;
        discountCents: number;
        orderNo: string;
        finalCents: number;
        paidAt: Date | null;
    }) | null>;
    getOrderByNo(tenantId: number, orderNo: string): Promise<({
        player: {
            displayName: string;
            id: number;
            tenantId: number;
            status: import(".prisma/client").$Enums.PlayerStatus;
            createdAt: Date;
            phone: string | null;
            memberNo: string | null;
            avatarUrl: string | null;
            balanceCents: number;
            totalRechargedCents: number;
            totalSpentCents: number;
            membershipLevel: import(".prisma/client").$Enums.MembershipLevel;
            points: number;
            birthday: Date | null;
        } | null;
        items: {
            description: string;
            id: bigint;
            sessionId: number | null;
            gameId: number | null;
            quantity: number;
            unitPrice: number;
            totalPrice: number;
            orderId: number;
        }[];
    } & {
        id: number;
        tenantId: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        createdAt: Date;
        playerId: number | null;
        venueId: number;
        amountCents: number;
        discountCents: number;
        orderNo: string;
        finalCents: number;
        paidAt: Date | null;
    }) | null>;
    markOrderAsPaid(tenantId: number, orderId: number): Promise<{
        id: number;
        tenantId: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        createdAt: Date;
        playerId: number | null;
        venueId: number;
        amountCents: number;
        discountCents: number;
        orderNo: string;
        finalCents: number;
        paidAt: Date | null;
    }>;
    cancelOrder(tenantId: number, orderId: number): Promise<{
        id: number;
        tenantId: number;
        status: import(".prisma/client").$Enums.OrderStatus;
        createdAt: Date;
        playerId: number | null;
        venueId: number;
        amountCents: number;
        discountCents: number;
        orderNo: string;
        finalCents: number;
        paidAt: Date | null;
    }>;
    getOrderStats(tenantId: number, venueId?: number): Promise<{
        totalOrders: number;
        paidOrders: number;
        totalRevenue: number;
        totalDiscount: number;
        avgOrderValue: number;
    }>;
}
export {};

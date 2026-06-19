import { BillingService } from './billing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class BillingManagementController {
    private billingService;
    private prisma;
    constructor(billingService: BillingService, prisma: PrismaService);
    listOrders(req: any, venueId?: string, skip?: string, take?: string): Promise<{
        data: ({
            player: {
                displayName: string;
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
        })[];
        pagination: {
            skip: number;
            take: number;
            total: number;
        };
    }>;
    getOrder(req: any, orderId: string): Promise<({
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
    markOrderAsPaid(req: any, orderId: string): Promise<{
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
    getOrderStats(req: any, venueId?: string): Promise<{
        totalOrders: number;
        paidOrders: number;
        totalRevenue: number;
        totalDiscount: number;
        avgOrderValue: number;
    }>;
    getRevenueTrend(req: any, days?: string): Promise<{
        days: number;
        dailyRevenue: {
            date: string;
            amountCents: number;
            amountYuan: number;
        }[];
        totalRevenue: number;
    }>;
}

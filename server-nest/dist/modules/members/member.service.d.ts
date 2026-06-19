import { PrismaService } from '../../shared/prisma/prisma.service';
import { MembershipLevel, PointsLogType } from '@prisma/client';
export declare const MEMBERSHIP_THRESHOLDS: Record<MembershipLevel, number>;
export declare const MEMBERSHIP_DISCOUNTS: Record<MembershipLevel, number>;
export declare class MemberService {
    private prisma;
    constructor(prisma: PrismaService);
    getOrCreateMember(tenantId: number, phone: string, displayName?: string): Promise<{
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
    }>;
    addPoints(tenantId: number, playerId: number, points: number, type: PointsLogType, description: string): Promise<{
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
    }>;
    updateMembershipLevel(tenantId: number, playerId: number): Promise<{
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
    } | null>;
    getDiscountRate(tenantId: number, playerId: number): Promise<number>;
    getMemberInfo(tenantId: number, playerId: number): Promise<({
        playerStats: {
            playerId: number;
            wins: number;
            games: number;
            lastWinAt: Date | null;
        } | null;
        pointsLogs: {
            type: import(".prisma/client").$Enums.PointsLogType;
            description: string;
            id: bigint;
            tenantId: number;
            createdAt: Date;
            points: number;
            playerId: number;
        }[];
    } & {
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
    }) | null>;
    getMemberPointsHistory(tenantId: number, playerId: number, take?: number): Promise<{
        type: import(".prisma/client").$Enums.PointsLogType;
        description: string;
        id: bigint;
        tenantId: number;
        createdAt: Date;
        points: number;
        playerId: number;
    }[]>;
}

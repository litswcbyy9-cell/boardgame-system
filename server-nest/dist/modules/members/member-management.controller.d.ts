import { MemberService } from './member.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class MemberManagementController {
    private memberService;
    private prisma;
    constructor(memberService: MemberService, prisma: PrismaService);
    listMembers(req: any, skip?: string, take?: string): Promise<{
        data: {
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
        }[];
        pagination: {
            skip: number;
            take: number;
            total: number;
        };
    }>;
    getMemberStats(req: any): Promise<{
        totalMembers: number;
        byLevel: {
            bronze: number;
            silver: number;
            gold: number;
            platinum: number;
            diamond: number;
        };
        totalSpent: number;
        avgSpent: number;
        totalPoints: number;
    }>;
    getMemberInfo(req: any, playerId: string): Promise<({
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
    getPointsHistory(req: any, playerId: string, take?: string): Promise<{
        type: import(".prisma/client").$Enums.PointsLogType;
        description: string;
        id: bigint;
        tenantId: number;
        createdAt: Date;
        points: number;
        playerId: number;
    }[]>;
}

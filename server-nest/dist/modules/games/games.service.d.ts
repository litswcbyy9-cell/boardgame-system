import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class GamesService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<{
        title: string;
        id: number;
        coverImageUrl: string | null;
        rulesPdfUrl: string | null;
        minPlayers: number;
        maxPlayers: number;
        category: string;
        difficultyLevel: number;
        avgMinutes: number;
        recommendWeight: import("@prisma/client/runtime/library").Decimal;
    }[]>;
    getLeaderboard(limit?: number): Promise<any[]>;
}

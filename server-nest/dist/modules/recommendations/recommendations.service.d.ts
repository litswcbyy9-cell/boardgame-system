import { PrismaService } from '../../shared/prisma/prisma.service';
import { TablesService } from '../tables/tables.service';
export declare class RecommendationsService {
    private prisma;
    private tablesService;
    constructor(prisma: PrismaService, tablesService: TablesService);
    recommendGames(dto: {
        playerId?: number | null;
        partySize: number;
        minutes: number;
        category?: string;
    }): Promise<{
        gameId: number;
        title: any;
        coverImageUrl: any;
        minPlayers: any;
        maxPlayers: any;
        category: any;
        difficultyLevel: any;
        avgMinutes: any;
        totalPlayRecords: number;
        recent30Records: number;
        score: number;
        scores: {
            people: number;
            duration: number;
            category: number;
            history: number;
            hot: number;
            weight: number;
        };
        reason: string;
    }[]>;
    recommendTables(partySize: number, startAt: string, endAt: string): Promise<{
        tableId: number;
        code: any;
        seatCapacity: number;
        areaType: any;
        posX: any;
        posY: any;
        status: any;
        recentSessions: number;
        score: number;
        scores: {
            capacity: number;
            availability: number;
            utilization: number;
        };
        reason: string;
    }[]>;
    private buildGameReason;
}

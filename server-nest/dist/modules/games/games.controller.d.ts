import { GamesService } from './games.service';
export declare class GamesController {
    private readonly gamesService;
    constructor(gamesService: GamesService);
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
    leaderboard(): Promise<any[]>;
}

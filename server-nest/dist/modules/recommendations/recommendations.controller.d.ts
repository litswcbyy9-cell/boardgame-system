import { RecommendationsService } from './recommendations.service';
export declare class RecommendationsController {
    private readonly recommendationsService;
    constructor(recommendationsService: RecommendationsService);
    recommendGames(playerId?: string, partySize?: string, minutes?: string, category?: string): Promise<{
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
    recommendTables(partySize: string | undefined, startAt: string, endAt: string): Promise<{
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
}

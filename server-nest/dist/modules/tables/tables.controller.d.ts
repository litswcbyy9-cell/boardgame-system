import { TablesService } from './tables.service';
export declare class TablesController {
    private readonly tablesService;
    constructor(tablesService: TablesService);
    getFloor(): Promise<{
        id: number;
        code: string;
        venueId: number;
        posX: number;
        posY: number;
        sortOrder: number;
        seatCapacity: number;
        areaType: string;
        floorPhotoUrl: string | null;
        status: import(".prisma/client").$Enums.TableStatus;
        currentReservationId: number | null;
        currentSessionId: number | null;
    }[]>;
    matchTables(partySize: string | undefined, startAt: string, endAt: string): Promise<{
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

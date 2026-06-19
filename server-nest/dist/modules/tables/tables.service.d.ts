import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class TablesService {
    private prisma;
    constructor(prisma: PrismaService);
    getFloorStatus(): Promise<{
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
    matchTables(partySize: number, startAt: string, endAt: string): Promise<{
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
    private buildTableReason;
}

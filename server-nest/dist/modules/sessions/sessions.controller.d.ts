import { SessionsService } from './sessions.service';
export declare class SessionsController {
    private readonly sessionsService;
    constructor(sessionsService: SessionsService);
    findOpen(): Promise<({
        reservation: ({
            player: {
                displayName: string;
                id: number;
                phone: string | null;
            } | null;
        } & {
            id: number;
            status: import(".prisma/client").$Enums.ReservationStatus;
            createdAt: Date;
            tableId: number;
            playerId: number | null;
            guestName: string;
            guestPhone: string | null;
            partySize: number;
            reservedStart: Date;
            reservedEnd: Date;
        }) | null;
        table: {
            id: number;
            code: string;
        };
    } & {
        id: number;
        tableId: number;
        guestName: string | null;
        guestPhone: string | null;
        partySize: number;
        startedAt: Date;
        endedAt: Date | null;
        billedMinutes: number | null;
        amountCents: number;
        notes: string | null;
        reservationId: number | null;
    })[]>;
    walkin(body: any): Promise<{
        sessionId: number;
    }>;
    settle(id: string, body: {
        billedMinutes: number;
        amountCents: number;
        notes?: string;
    }): Promise<{
        ok: boolean;
    }>;
    addGameRecord(id: string, body: any): Promise<{
        recordId: number;
    }>;
}

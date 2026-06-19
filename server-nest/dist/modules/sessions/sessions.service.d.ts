import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class SessionsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    walkin(dto: {
        tableId: number;
        guestName?: string;
        guestPhone?: string;
        partySize: number;
    }): Promise<{
        sessionId: number;
    }>;
    settle(sessionId: number, billedMinutes: number, amountCents: number, notes?: string): Promise<{
        ok: boolean;
    }>;
    addGameRecord(sessionId: number, dto: {
        gameId: number;
        winnerPlayerId?: number;
        winnerDisplayName?: string;
        scoreJson?: any;
    }): Promise<{
        recordId: number;
    }>;
}

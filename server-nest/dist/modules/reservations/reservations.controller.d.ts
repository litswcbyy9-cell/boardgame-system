import { ReservationsService } from './reservations.service';
export declare class ReservationsController {
    private readonly reservationsService;
    constructor(reservationsService: ReservationsService);
    findAll(): Promise<({
        player: {
            displayName: string;
            id: number;
            phone: string | null;
        } | null;
        table: {
            id: number;
            code: string;
        };
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
    })[]>;
    create(body: any): Promise<{
        reservationId: number;
    }>;
    publicReserve(body: any): Promise<{
        reservationId: number;
    }>;
    checkin(id: string): Promise<{
        sessionId: number;
    }>;
    cancel(id: string): Promise<{
        ok: boolean;
    }>;
}

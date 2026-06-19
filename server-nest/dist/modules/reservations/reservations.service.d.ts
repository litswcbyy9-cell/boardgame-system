import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '../../config/config.service';
export declare class ReservationsService {
    private prisma;
    private config;
    constructor(prisma: PrismaService, config: ConfigService);
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
    create(dto: {
        tableId: number;
        playerId?: number | null;
        guestName: string;
        guestPhone?: string | null;
        partySize: number;
        reservedStart: string;
        reservedEnd: string;
    }): Promise<{
        reservationId: number;
    }>;
    publicReservation(dto: {
        tableId?: number | null;
        guestName: string;
        guestPhone?: string;
        partySize: number;
        reservedStart: string;
        reservedEnd: string;
    }): Promise<{
        reservationId: number;
    }>;
    checkin(reservationId: number): Promise<{
        sessionId: number;
    }>;
    cancel(reservationId: number): Promise<{
        ok: boolean;
    }>;
    expireOverdue(): Promise<{
        expiredCount: number;
    }>;
}

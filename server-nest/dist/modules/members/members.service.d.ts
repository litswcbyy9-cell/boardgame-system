import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class MembersService {
    private prisma;
    constructor(prisma: PrismaService);
    findAllActive(limit?: number): Promise<{
        displayName: string;
        id: number;
        status: import(".prisma/client").$Enums.PlayerStatus;
        phone: string | null;
        memberNo: string | null;
        avatarUrl: string | null;
        balanceCents: number;
        totalRechargedCents: number;
        totalSpentCents: number;
    }[]>;
    search(q?: string, status?: string): Promise<{
        displayName: string;
        id: number;
        status: import(".prisma/client").$Enums.PlayerStatus;
        createdAt: Date;
        phone: string | null;
        memberNo: string | null;
        avatarUrl: string | null;
        balanceCents: number;
        totalRechargedCents: number;
        totalSpentCents: number;
    }[]>;
    create(dto: {
        displayName: string;
        phone?: string;
        avatarUrl?: string;
        initialBalanceCents: number;
    }): Promise<{
        id: number;
        memberNo: string;
    }>;
    recharge(id: number, amountCents: number): Promise<{
        ok: boolean;
    }>;
    consume(id: number, amountCents: number): Promise<{
        ok: boolean;
    }>;
    disable(id: number): Promise<{
        ok: boolean;
    }>;
    getReservations(memberId: number): Promise<({
        table: {
            code: string;
            seatCapacity: number;
            areaType: string;
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
}

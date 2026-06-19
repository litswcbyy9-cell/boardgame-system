import { MembersService } from './members.service';
import { CreateMemberDto, AmountDto } from './dto/member.dto';
export declare class MembersController {
    private readonly membersService;
    constructor(membersService: MembersService);
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
    create(dto: CreateMemberDto): Promise<{
        id: number;
        memberNo: string;
    }>;
    getReservations(id: string): Promise<({
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
    recharge(id: string, dto: AmountDto): Promise<{
        ok: boolean;
    }>;
    consume(id: string, dto: AmountDto): Promise<{
        ok: boolean;
    }>;
    disable(id: string): Promise<{
        ok: boolean;
    }>;
}

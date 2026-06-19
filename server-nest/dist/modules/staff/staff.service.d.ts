import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class StaffService {
    private prisma;
    constructor(prisma: PrismaService);
    search(q?: string, status?: string): Promise<any[]>;
    create(dto: {
        fullName: string;
        phone?: string;
        position?: string;
        hiredAt?: string;
        employeeNo?: string;
    }): Promise<{
        id: number;
        employeeNo: string;
    }>;
    update(id: number, dto: {
        fullName?: string;
        phone?: string;
        position?: string;
        status?: string;
        hiredAt?: string;
        employeeNo?: string;
    }): Promise<{
        ok: boolean;
    }>;
    disable(id: number): Promise<{
        ok: boolean;
    }>;
    createAccount(staffId: number, dto: {
        username: string;
        password: string;
        role: string;
    }): Promise<{
        ok: boolean;
    }>;
}

import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class TenantService {
    private prisma;
    constructor(prisma: PrismaService);
    createDefaultTenant(): Promise<{
        name: string;
        id: number;
        status: import(".prisma/client").$Enums.TenantStatus;
        createdAt: Date;
        phone: string | null;
        planType: import(".prisma/client").$Enums.PlanType;
        expiredAt: Date | null;
    }>;
    getTenant(id: number): Promise<{
        name: string;
        id: number;
        status: import(".prisma/client").$Enums.TenantStatus;
        createdAt: Date;
        phone: string | null;
        planType: import(".prisma/client").$Enums.PlanType;
        expiredAt: Date | null;
    } | null>;
    createTenant(data: {
        name: string;
        phone?: string;
        planType?: 'free' | 'basic' | 'pro' | 'enterprise';
    }): Promise<{
        name: string;
        id: number;
        status: import(".prisma/client").$Enums.TenantStatus;
        createdAt: Date;
        phone: string | null;
        planType: import(".prisma/client").$Enums.PlanType;
        expiredAt: Date | null;
    }>;
    updateTenantPlan(id: number, planType: string): Promise<{
        name: string;
        id: number;
        status: import(".prisma/client").$Enums.TenantStatus;
        createdAt: Date;
        phone: string | null;
        planType: import(".prisma/client").$Enums.PlanType;
        expiredAt: Date | null;
    }>;
}

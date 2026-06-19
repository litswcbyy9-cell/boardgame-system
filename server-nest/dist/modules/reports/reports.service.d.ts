import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class ReportsService {
    private prisma;
    constructor(prisma: PrismaService);
    dailyRevenue(date: string): Promise<any>;
    gamePopularity(days?: number): Promise<any[]>;
    tableUtilization(days?: number): Promise<any[]>;
}

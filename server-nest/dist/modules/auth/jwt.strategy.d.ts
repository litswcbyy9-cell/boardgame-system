import { Strategy } from 'passport-jwt';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private config;
    private prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    validate(payload: {
        sub: number;
    }): Promise<{
        id: number;
        username: string;
        displayName: string;
        role: import(".prisma/client").$Enums.UserRole;
        staffId: number | null;
        employeeNo: string | null;
        staffName: string | null;
        staffPhone: string | null;
        position: string | null;
    }>;
}
export {};

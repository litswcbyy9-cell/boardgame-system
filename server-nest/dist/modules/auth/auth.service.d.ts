import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '../../config/config.service';
import { LoginDto, RegisterDto, LoginResponseDto } from './dto/auth.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    private config;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService);
    login(dto: LoginDto): Promise<LoginResponseDto>;
    register(dto: RegisterDto): Promise<LoginResponseDto>;
    getProfile(userId: number): Promise<{
        id: any;
        username: any;
        displayName: any;
        role: any;
        staffId: any;
        employeeNo: any;
        staffName: any;
        staffPhone: any;
        position: any;
    } | null>;
    logout(tokenHash: string): Promise<{
        ok: boolean;
    }>;
    private generateToken;
    private serializeUser;
}

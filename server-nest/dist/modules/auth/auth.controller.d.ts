import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<import("./dto/auth.dto").LoginResponseDto>;
    register(dto: RegisterDto): Promise<import("./dto/auth.dto").LoginResponseDto>;
    me(user: any): Promise<{
        user: any;
    }>;
    logout(req: any): Promise<{
        ok: boolean;
    }>;
}

export declare class LoginDto {
    username: string;
    password: string;
}
export declare class RegisterDto {
    username: string;
    displayName: string;
    password: string;
}
export declare class LoginResponseDto {
    token: string;
    user: Record<string, any>;
}

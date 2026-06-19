export declare class ConfigService {
    get dbHost(): string;
    get dbPort(): number;
    get dbUser(): string;
    get dbPassword(): string;
    get dbName(): string;
    get port(): number;
    get jwtSecret(): string;
    get jwtExpiresIn(): string;
    get refreshExpiresIn(): string;
    get reservationGraceMinutes(): number;
    get publicRegisterEnabled(): boolean;
    get corsOrigin(): string[];
    get isProduction(): boolean;
}

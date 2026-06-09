import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class ConfigService {
  get dbHost(): string { return process.env.DB_HOST || '127.0.0.1'; }
  get dbPort(): number { return Number(process.env.DB_PORT || 3306); }
  get dbUser(): string { return process.env.DB_USER || 'boardgame'; }
  get dbPassword(): string { return process.env.DB_PASSWORD || 'boardgame'; }
  get dbName(): string { return process.env.DB_NAME || 'boardgame'; }
  get port(): number { return Number(process.env.PORT || 9898); }
  get jwtSecret(): string { return process.env.JWT_SECRET || 'boardgame-jwt-secret-change-me'; }
  get jwtExpiresIn(): string { return process.env.JWT_EXPIRES || '15m'; }
  get refreshExpiresIn(): string { return process.env.REFRESH_EXPIRES || '7d'; }
  get reservationGraceMinutes(): number {
    return Math.max(1, Math.min(180, Number(process.env.RESERVATION_GRACE_MINUTES || 15)));
  }
  get publicRegisterEnabled(): boolean { return process.env.ALLOW_PUBLIC_REGISTER === '1'; }
  get corsOrigin(): string[] {
    const list = String(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    return list.length ? list : [];
  }
  get isProduction(): boolean { return process.env.NODE_ENV === 'production'; }
}

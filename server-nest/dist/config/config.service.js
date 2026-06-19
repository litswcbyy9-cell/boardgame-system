"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
const dotenv = require("dotenv");
dotenv.config();
let ConfigService = class ConfigService {
    get dbHost() { return process.env.DB_HOST || '127.0.0.1'; }
    get dbPort() { return Number(process.env.DB_PORT || 3306); }
    get dbUser() { return process.env.DB_USER || 'boardgame'; }
    get dbPassword() { return process.env.DB_PASSWORD || 'boardgame'; }
    get dbName() { return process.env.DB_NAME || 'boardgame'; }
    get port() { return Number(process.env.PORT || 9898); }
    get jwtSecret() { return process.env.JWT_SECRET || 'boardgame-jwt-secret-change-me'; }
    get jwtExpiresIn() { return process.env.JWT_EXPIRES || '15m'; }
    get refreshExpiresIn() { return process.env.REFRESH_EXPIRES || '7d'; }
    get reservationGraceMinutes() {
        return Math.max(1, Math.min(180, Number(process.env.RESERVATION_GRACE_MINUTES || 15)));
    }
    get publicRegisterEnabled() { return process.env.ALLOW_PUBLIC_REGISTER === '1'; }
    get corsOrigin() {
        const list = String(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
        return list.length ? list : [];
    }
    get isProduction() { return process.env.NODE_ENV === 'production'; }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)()
], ConfigService);
//# sourceMappingURL=config.service.js.map
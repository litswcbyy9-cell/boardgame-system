"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const config_service_1 = require("../../config/config.service");
const bcrypt = require("bcryptjs");
let AuthService = class AuthService {
    constructor(prisma, jwt, config) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
    }
    async login(dto) {
        const username = dto.username.trim().toLowerCase();
        const user = await this.prisma.appUser.findUnique({
            where: {
                tenantId_username: {
                    tenantId: 1,
                    username,
                }
            },
            include: { staff: true },
        });
        if (!user || user.status !== 'active') {
            throw new common_1.UnauthorizedException('账号或密码错误');
        }
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('账号或密码错误');
        }
        const token = this.generateToken(user.id, user.tenantId);
        return {
            token,
            user: this.serializeUser(user),
        };
    }
    async register(dto) {
        if (!this.config.publicRegisterEnabled) {
            throw new common_1.ForbiddenException('公开注册已关闭，请由管理员在员工管理中创建账号');
        }
        const username = dto.username.trim().toLowerCase();
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const existing = await this.prisma.appUser.findUnique({
            where: {
                tenantId_username: {
                    tenantId: 1,
                    username,
                }
            },
        });
        if (existing)
            throw new common_1.ConflictException('账号已存在，请换一个账号名');
        const result = await this.prisma.$transaction(async (tx) => {
            const tempNo = `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const staff = await tx.staffProfile.create({
                data: {
                    employeeNo: tempNo,
                    fullName: dto.displayName || username,
                    position: '店员',
                    status: 'active',
                    hiredAt: new Date(),
                },
            });
            const employeeNo = `ST${new Date().getFullYear()}${String(staff.id).padStart(5, '0')}`;
            await tx.staffProfile.update({
                where: { id: staff.id },
                data: { employeeNo },
            });
            const appUser = await tx.appUser.create({
                data: {
                    tenantId: 1,
                    staffId: staff.id,
                    username,
                    displayName: dto.displayName || username,
                    passwordHash,
                    role: 'staff',
                },
                include: { staff: true },
            });
            return appUser;
        });
        const token = this.generateToken(result.id, result.tenantId);
        return { token, user: this.serializeUser(result) };
    }
    async getProfile(userId) {
        const user = await this.prisma.appUser.findUnique({
            where: { id: userId },
            include: { staff: true },
        });
        if (!user || user.status !== 'active')
            return null;
        return this.serializeUser(user);
    }
    async logout(tokenHash) {
        return { ok: true };
    }
    generateToken(userId, tenantId) {
        const payload = { sub: userId, tenantId };
        return this.jwt.sign(payload);
    }
    serializeUser(row) {
        return {
            id: row.id,
            username: row.username,
            displayName: row.displayName,
            role: row.role,
            staffId: row.staffId ?? null,
            employeeNo: row.staff?.employeeNo ?? null,
            staffName: row.staff?.fullName ?? null,
            staffPhone: row.staff?.phone ?? null,
            position: row.staff?.position ?? null,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_service_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
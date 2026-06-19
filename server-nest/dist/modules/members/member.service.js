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
exports.MemberService = exports.MEMBERSHIP_DISCOUNTS = exports.MEMBERSHIP_THRESHOLDS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
exports.MEMBERSHIP_THRESHOLDS = {
    bronze: 0,
    silver: 50000,
    gold: 200000,
    platinum: 500000,
    diamond: 1000000,
};
exports.MEMBERSHIP_DISCOUNTS = {
    bronze: 10000,
    silver: 9700,
    gold: 9500,
    platinum: 9300,
    diamond: 9000,
};
let MemberService = class MemberService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOrCreateMember(tenantId, phone, displayName) {
        let player = await this.prisma.player.findFirst({
            where: {
                tenantId,
                phone,
            },
        });
        if (!player) {
            player = await this.prisma.player.create({
                data: {
                    tenantId,
                    phone,
                    displayName: displayName || `用户${phone.slice(-4)}`,
                    membershipLevel: 'bronze',
                    points: 0,
                },
            });
        }
        return player;
    }
    async addPoints(tenantId, playerId, points, type, description) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
        });
        if (!player || player.tenantId !== tenantId) {
            throw new Error('Player not found or tenant mismatch');
        }
        await this.prisma.pointsLog.create({
            data: {
                playerId,
                tenantId,
                points,
                type,
                description,
            },
        });
        const updated = await this.prisma.player.update({
            where: { id: playerId },
            data: {
                points: {
                    increment: points,
                },
            },
        });
        return updated;
    }
    async updateMembershipLevel(tenantId, playerId) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
        });
        if (!player || player.tenantId !== tenantId) {
            return null;
        }
        const totalSpent = player.totalSpentCents;
        let newLevel = 'bronze';
        if (totalSpent >= exports.MEMBERSHIP_THRESHOLDS.diamond) {
            newLevel = 'diamond';
        }
        else if (totalSpent >= exports.MEMBERSHIP_THRESHOLDS.platinum) {
            newLevel = 'platinum';
        }
        else if (totalSpent >= exports.MEMBERSHIP_THRESHOLDS.gold) {
            newLevel = 'gold';
        }
        else if (totalSpent >= exports.MEMBERSHIP_THRESHOLDS.silver) {
            newLevel = 'silver';
        }
        if (newLevel !== player.membershipLevel) {
            return this.prisma.player.update({
                where: { id: playerId },
                data: {
                    membershipLevel: newLevel,
                },
            });
        }
        return player;
    }
    async getDiscountRate(tenantId, playerId) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
        });
        if (!player || player.tenantId !== tenantId) {
            return 10000;
        }
        return exports.MEMBERSHIP_DISCOUNTS[player.membershipLevel];
    }
    async getMemberInfo(tenantId, playerId) {
        return this.prisma.player.findFirst({
            where: {
                id: playerId,
                tenantId,
            },
            include: {
                playerStats: true,
                pointsLogs: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
            },
        });
    }
    async getMemberPointsHistory(tenantId, playerId, take = 50) {
        return this.prisma.pointsLog.findMany({
            where: {
                playerId,
                tenantId,
            },
            orderBy: { createdAt: 'desc' },
            take,
        });
    }
};
exports.MemberService = MemberService;
exports.MemberService = MemberService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemberService);
//# sourceMappingURL=member.service.js.map
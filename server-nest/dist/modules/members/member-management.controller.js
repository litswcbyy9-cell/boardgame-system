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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberManagementController = void 0;
const common_1 = require("@nestjs/common");
const member_service_1 = require("./member.service");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let MemberManagementController = class MemberManagementController {
    constructor(memberService, prisma) {
        this.memberService = memberService;
        this.prisma = prisma;
    }
    async listMembers(req, skip = '0', take = '20') {
        const tenantId = req.tenant.id;
        const players = await this.prisma.player.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            skip: parseInt(skip),
            take: parseInt(take),
        });
        const total = await this.prisma.player.count({
            where: { tenantId },
        });
        return {
            data: players,
            pagination: { skip: parseInt(skip), take: parseInt(take), total },
        };
    }
    async getMemberStats(req) {
        const tenantId = req.tenant.id;
        const players = await this.prisma.player.findMany({ where: { tenantId } });
        const stats = {
            totalMembers: players.length,
            byLevel: {
                bronze: players.filter(p => p.membershipLevel === 'bronze').length,
                silver: players.filter(p => p.membershipLevel === 'silver').length,
                gold: players.filter(p => p.membershipLevel === 'gold').length,
                platinum: players.filter(p => p.membershipLevel === 'platinum').length,
                diamond: players.filter(p => p.membershipLevel === 'diamond').length,
            },
            totalSpent: players.reduce((sum, p) => sum + p.totalSpentCents, 0),
            avgSpent: players.length > 0
                ? Math.floor(players.reduce((sum, p) => sum + p.totalSpentCents, 0) / players.length)
                : 0,
            totalPoints: players.reduce((sum, p) => sum + p.points, 0),
        };
        return stats;
    }
    async getMemberInfo(req, playerId) {
        const tenantId = req.tenant.id;
        return this.memberService.getMemberInfo(tenantId, parseInt(playerId));
    }
    async getPointsHistory(req, playerId, take = '20') {
        const tenantId = req.tenant.id;
        return this.memberService.getMemberPointsHistory(tenantId, parseInt(playerId), parseInt(take));
    }
};
exports.MemberManagementController = MemberManagementController;
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('skip')),
    __param(2, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MemberManagementController.prototype, "listMembers", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MemberManagementController.prototype, "getMemberStats", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MemberManagementController.prototype, "getMemberInfo", null);
__decorate([
    (0, common_1.Get)(':id/points-history'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MemberManagementController.prototype, "getPointsHistory", null);
exports.MemberManagementController = MemberManagementController = __decorate([
    (0, common_1.Controller)('members-mgmt'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [member_service_1.MemberService,
        prisma_service_1.PrismaService])
], MemberManagementController);
//# sourceMappingURL=member-management.controller.js.map
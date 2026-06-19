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
exports.MembersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let MembersService = class MembersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAllActive(limit = 800) {
        return this.prisma.player.findMany({
            where: { status: 'active' },
            select: {
                id: true, memberNo: true, displayName: true, phone: true,
                avatarUrl: true, balanceCents: true, totalRechargedCents: true,
                totalSpentCents: true, status: true,
            },
            orderBy: { id: 'asc' },
            take: limit,
        });
    }
    async search(q, status) {
        const where = {};
        if (q) {
            where.OR = [
                { displayName: { contains: q } },
                { phone: { contains: q } },
                { memberNo: { contains: q } },
            ];
        }
        if (status === 'active' || status === 'disabled') {
            where.status = status;
        }
        return this.prisma.player.findMany({
            where,
            select: {
                id: true, memberNo: true, displayName: true, phone: true,
                avatarUrl: true, balanceCents: true, totalRechargedCents: true,
                totalSpentCents: true, status: true, createdAt: true,
            },
            orderBy: [{ status: 'asc' }, { id: 'desc' }],
            take: 300,
        });
    }
    async create(dto) {
        if (!dto.displayName?.trim()) {
            throw new common_1.BadRequestException('会员姓名不能为空');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const player = await tx.player.create({
                data: {
                    displayName: dto.displayName.trim(),
                    phone: dto.phone || null,
                    avatarUrl: dto.avatarUrl || null,
                    balanceCents: dto.initialBalanceCents,
                    totalRechargedCents: dto.initialBalanceCents,
                },
            });
            const memberNo = `MB${new Date().getFullYear()}${String(player.id).padStart(5, '0')}`;
            await tx.player.update({
                where: { id: player.id },
                data: { memberNo },
            });
            return { id: player.id, memberNo };
        });
        return result;
    }
    async recharge(id, amountCents) {
        if (amountCents <= 0)
            throw new common_1.BadRequestException('金额必须大于 0');
        const result = await this.prisma.player.updateMany({
            where: { id, status: 'active' },
            data: {
                balanceCents: { increment: amountCents },
                totalRechargedCents: { increment: amountCents },
            },
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('会员不存在或已停用');
        return { ok: true };
    }
    async consume(id, amountCents) {
        if (amountCents <= 0)
            throw new common_1.BadRequestException('金额必须大于 0');
        const player = await this.prisma.player.findUnique({ where: { id } });
        if (!player || player.status !== 'active')
            throw new common_1.NotFoundException('会员不存在或已停用');
        if (player.balanceCents < amountCents)
            throw new common_1.ConflictException('会员余额不足');
        await this.prisma.player.update({
            where: { id },
            data: {
                balanceCents: { decrement: amountCents },
                totalSpentCents: { increment: amountCents },
            },
        });
        return { ok: true };
    }
    async disable(id) {
        const result = await this.prisma.player.updateMany({
            where: { id, status: 'active' },
            data: { status: 'disabled' },
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('会员不存在或已停用');
        return { ok: true };
    }
    async getReservations(memberId) {
        return this.prisma.reservation.findMany({
            where: { playerId: memberId },
            include: { table: { select: { code: true, seatCapacity: true, areaType: true } } },
            orderBy: { reservedStart: 'desc' },
            take: 80,
        });
    }
};
exports.MembersService = MembersService;
exports.MembersService = MembersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MembersService);
//# sourceMappingURL=members.service.js.map
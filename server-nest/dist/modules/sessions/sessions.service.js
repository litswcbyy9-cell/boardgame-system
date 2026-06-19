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
exports.SessionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let SessionsService = class SessionsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findOpen() {
        return this.prisma.playSession.findMany({
            where: { endedAt: null },
            include: {
                table: { select: { id: true, code: true } },
                reservation: {
                    include: { player: { select: { id: true, displayName: true, phone: true } } },
                },
            },
            orderBy: { startedAt: 'desc' },
        });
    }
    async walkin(dto) {
        const table = await this.prisma.gameTable.findUnique({
            where: { id: dto.tableId },
            include: { tableState: true },
        });
        if (!table)
            throw new common_1.NotFoundException('桌位不存在');
        if (table.tableState?.status === 'occupied')
            throw new common_1.ConflictException('桌位正在占用中');
        if (dto.partySize > table.seatCapacity)
            throw new common_1.ConflictException('人数超过桌位容量');
        const block = await this.prisma.reservation.findFirst({
            where: {
                tableId: dto.tableId,
                status: 'pending',
                reservedStart: { lte: new Date() },
                reservedEnd: { gte: new Date() },
            },
        });
        if (block)
            throw new common_1.ConflictException('当前时间段已有待入场预约，不能现场开台');
        const session = await this.prisma.$transaction(async (tx) => {
            const result = await tx.playSession.create({
                data: {
                    tableId: dto.tableId,
                    guestName: dto.guestName || '现场客人',
                    guestPhone: dto.guestPhone || null,
                    partySize: dto.partySize,
                    startedAt: new Date(),
                },
            });
            await tx.gameTableState.update({
                where: { tableId: dto.tableId },
                data: {
                    status: 'occupied',
                    currentSessionId: result.id,
                },
            });
            return result;
        });
        return { sessionId: Number(session.id) };
    }
    async settle(sessionId, billedMinutes, amountCents, notes) {
        const session = await this.prisma.playSession.findUnique({ where: { id: sessionId } });
        if (!session || session.endedAt)
            throw new common_1.ConflictException('该对局不存在或已结算');
        await this.prisma.$transaction(async (tx) => {
            await tx.playSession.update({
                where: { id: sessionId },
                data: {
                    endedAt: new Date(),
                    billedMinutes,
                    amountCents,
                    notes: notes || null,
                },
            });
            if (session.reservationId) {
                await tx.reservation.update({
                    where: { id: session.reservationId },
                    data: { status: 'completed' },
                });
            }
            const next = await tx.reservation.findFirst({
                where: { tableId: session.tableId, status: 'pending' },
                orderBy: [{ reservedStart: 'asc' }, { id: 'asc' }],
            });
            await tx.gameTableState.update({
                where: { tableId: session.tableId },
                data: {
                    status: next ? 'reserved' : 'idle',
                    currentSessionId: null,
                    currentReservationId: next?.id || null,
                },
            });
        });
        return { ok: true };
    }
    async addGameRecord(sessionId, dto) {
        const session = await this.prisma.playSession.findUnique({ where: { id: sessionId } });
        if (!session || !session.endedAt)
            throw new common_1.ConflictException('请先结算关台再录入战绩');
        const game = await this.prisma.game.findUnique({ where: { id: dto.gameId } });
        if (!game)
            throw new common_1.NotFoundException('选择的桌游不存在');
        const record = await this.prisma.gameRecord.create({
            data: {
                sessionId,
                gameId: dto.gameId,
                titleSnapshot: game.title,
                winnerPlayerId: dto.winnerPlayerId || null,
                winnerDisplayName: dto.winnerDisplayName || null,
                scoreJson: dto.scoreJson || null,
                playedAt: new Date(),
            },
        });
        return { recordId: Number(record.id) };
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionsService);
//# sourceMappingURL=sessions.service.js.map
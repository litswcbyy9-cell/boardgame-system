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
exports.ReservationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const config_service_1 = require("../../config/config.service");
let ReservationsService = class ReservationsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async findAll() {
        return this.prisma.reservation.findMany({
            where: { status: { in: ['pending', 'active'] } },
            include: {
                table: { select: { id: true, code: true } },
                player: { select: { id: true, displayName: true, phone: true } },
            },
            orderBy: { reservedStart: 'desc' },
            take: 200,
        });
    }
    async create(dto) {
        if (!dto.tableId || !dto.guestName || !dto.reservedStart || !dto.reservedEnd) {
            throw new common_1.BadRequestException('缺少必填字段');
        }
        if (new Date(dto.reservedStart) >= new Date(dto.reservedEnd)) {
            throw new common_1.BadRequestException('结束时间必须晚于开始时间');
        }
        const table = await this.prisma.gameTable.findUnique({
            where: { id: dto.tableId },
            include: { tableState: true },
        });
        if (!table)
            throw new common_1.NotFoundException('桌位不存在');
        if (table.tableState?.status === 'occupied')
            throw new common_1.ConflictException('桌位正在占用中');
        if (dto.partySize > table.seatCapacity)
            throw new common_1.ConflictException('人数超过该桌位容量');
        const conflict = await this.prisma.reservation.findFirst({
            where: {
                tableId: dto.tableId,
                status: { in: ['pending', 'active'] },
                AND: [
                    { reservedStart: { lt: new Date(dto.reservedEnd) } },
                    { reservedEnd: { gt: new Date(dto.reservedStart) } },
                ],
            },
        });
        if (conflict)
            throw new common_1.ConflictException('该时间段已有预约');
        const result = await this.prisma.$transaction(async (tx) => {
            const reservation = await tx.reservation.create({
                data: {
                    tableId: dto.tableId,
                    playerId: dto.playerId || null,
                    guestName: dto.guestName,
                    guestPhone: dto.guestPhone || null,
                    partySize: dto.partySize,
                    reservedStart: new Date(dto.reservedStart),
                    reservedEnd: new Date(dto.reservedEnd),
                },
            });
            const firstPending = await tx.reservation.findFirst({
                where: { tableId: dto.tableId, status: 'pending' },
                orderBy: [{ reservedStart: 'asc' }, { id: 'asc' }],
            });
            await tx.gameTableState.update({
                where: { tableId: dto.tableId },
                data: {
                    status: 'reserved',
                    currentReservationId: firstPending?.id || null,
                    currentSessionId: null,
                },
            });
            return reservation;
        });
        return { reservationId: Number(result.id) };
    }
    async publicReservation(dto) {
        return this.create({
            tableId: dto.tableId,
            playerId: null,
            guestName: dto.guestName,
            guestPhone: dto.guestPhone,
            partySize: dto.partySize,
            reservedStart: dto.reservedStart,
            reservedEnd: dto.reservedEnd,
        });
    }
    async checkin(reservationId) {
        const reservation = await this.prisma.reservation.findUnique({
            where: { id: reservationId },
            include: { player: true },
        });
        if (!reservation)
            throw new common_1.NotFoundException('预约记录不存在');
        if (reservation.status !== 'pending')
            throw new common_1.ConflictException('该预约不是待入场状态');
        const result = await this.prisma.$transaction(async (tx) => {
            const session = await tx.playSession.create({
                data: {
                    tableId: reservation.tableId,
                    reservationId: reservation.id,
                    guestName: reservation.guestName,
                    guestPhone: reservation.guestPhone,
                    partySize: reservation.partySize,
                    startedAt: new Date(),
                },
            });
            await tx.reservation.update({
                where: { id: reservationId },
                data: { status: 'active' },
            });
            return session;
        });
        return { sessionId: Number(result.id) };
    }
    async cancel(reservationId) {
        const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
        if (!r)
            throw new common_1.NotFoundException('预约记录不存在');
        if (r.status !== 'pending')
            throw new common_1.ConflictException('该预约已入场、取消或完成，不能再取消');
        await this.prisma.$transaction(async (tx) => {
            await tx.reservation.update({
                where: { id: reservationId },
                data: { status: 'cancelled' },
            });
            const next = await tx.reservation.findFirst({
                where: { tableId: r.tableId, status: 'pending' },
                orderBy: [{ reservedStart: 'asc' }, { id: 'asc' }],
            });
            await tx.gameTableState.update({
                where: { tableId: r.tableId },
                data: {
                    status: next ? 'reserved' : 'idle',
                    currentReservationId: next?.id || null,
                },
            });
        });
        return { ok: true };
    }
    async expireOverdue() {
        const grace = this.config.reservationGraceMinutes;
        const overdue = await this.prisma.$queryRawUnsafe(`SELECT DISTINCT table_id FROM reservations
       WHERE status = 'pending'
         AND reserved_start <= DATE_SUB(NOW(), INTERVAL ? MINUTE)`, grace);
        if (!overdue.length)
            return { expiredCount: 0 };
        await this.prisma.reservation.updateMany({
            where: {
                status: 'pending',
                reservedStart: { lte: new Date(Date.now() - grace * 60000) },
            },
            data: { status: 'no_show' },
        });
        return { expiredCount: overdue.length };
    }
};
exports.ReservationsService = ReservationsService;
exports.ReservationsService = ReservationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_service_1.ConfigService])
], ReservationsService);
//# sourceMappingURL=reservations.service.js.map
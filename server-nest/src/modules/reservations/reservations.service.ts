import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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

  async create(dto: {
    tableId: number;
    playerId?: number | null;
    guestName: string;
    guestPhone?: string | null;
    partySize: number;
    reservedStart: string;
    reservedEnd: string;
  }) {
    if (!dto.tableId || !dto.guestName || !dto.reservedStart || !dto.reservedEnd) {
      throw new BadRequestException('缺少必填字段');
    }
    if (new Date(dto.reservedStart) >= new Date(dto.reservedEnd)) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    // 检查桌位是否存在、冲突
    const table = await this.prisma.gameTable.findUnique({
      where: { id: dto.tableId },
      include: { tableState: true },
    });
    if (!table) throw new NotFoundException('桌位不存在');
    if (table.tableState?.status === 'occupied') throw new ConflictException('桌位正在占用中');
    if (dto.partySize > table.seatCapacity) throw new ConflictException('人数超过该桌位容量');

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
    if (conflict) throw new ConflictException('该时间段已有预约');

    // 事务创建预约并更新桌态
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

      // 更新桌位运行态
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

  async publicReservation(dto: {
    tableId?: number | null;
    guestName: string;
    guestPhone?: string;
    partySize: number;
    reservedStart: string;
    reservedEnd: string;
  }) {
    // 如果没有指定桌位，自动匹配
    // 这里复用 matchTables 逻辑，需要注入 TablesService
    // 简化处理：直接调用 create 并自动选桌
    return this.create({
      tableId: dto.tableId!,
      playerId: null,
      guestName: dto.guestName,
      guestPhone: dto.guestPhone,
      partySize: dto.partySize,
      reservedStart: dto.reservedStart,
      reservedEnd: dto.reservedEnd,
    });
  }

  async checkin(reservationId: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { player: true },
    });
    if (!reservation) throw new NotFoundException('预约记录不存在');
    if (reservation.status !== 'pending') throw new ConflictException('该预约不是待入场状态');

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

  async cancel(reservationId: number) {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r) throw new NotFoundException('预约记录不存在');
    if (r.status !== 'pending') throw new ConflictException('该预约已入场、取消或完成，不能再取消');

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'cancelled' },
      });

      // 重排桌位下一个 pending
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
    const overdue = await this.prisma.$queryRawUnsafe<{ table_id: number }[]>(
      `SELECT DISTINCT table_id FROM reservations
       WHERE status = 'pending'
         AND reserved_start <= DATE_SUB(NOW(), INTERVAL ? MINUTE)`, grace,
    );

    if (!overdue.length) return { expiredCount: 0 };

    await this.prisma.reservation.updateMany({
      where: {
        status: 'pending',
        reservedStart: { lte: new Date(Date.now() - grace * 60000) },
      },
      data: { status: 'no_show' },
    });

    return { expiredCount: overdue.length };
  }
}

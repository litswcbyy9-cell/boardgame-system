import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

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

  async walkin(dto: { tableId: number; guestName?: string; guestPhone?: string; partySize: number }) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: dto.tableId },
      include: { tableState: true },
    });
    if (!table) throw new NotFoundException('桌位不存在');
    if (table.tableState?.status === 'occupied') throw new ConflictException('桌位正在占用中');
    if (dto.partySize > table.seatCapacity) throw new ConflictException('人数超过桌位容量');

    // 检查当前时段是否有待入场预约
    const block = await this.prisma.reservation.findFirst({
      where: {
        tableId: dto.tableId,
        status: 'pending',
        reservedStart: { lte: new Date() },
        reservedEnd: { gte: new Date() },
      },
    });
    if (block) throw new ConflictException('当前时间段已有待入场预约，不能现场开台');

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

  async settle(sessionId: number, billedMinutes: number, amountCents: number, notes?: string) {
    const session = await this.prisma.playSession.findUnique({ where: { id: sessionId } });
    if (!session || session.endedAt) throw new ConflictException('该对局不存在或已结算');

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

      // 完成关联预约 + 释放桌位
      if (session.reservationId) {
        await tx.reservation.update({
          where: { id: session.reservationId },
          data: { status: 'completed' },
        });
      }

      // 检查下一个预约
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

  async addGameRecord(sessionId: number, dto: {
    gameId: number;
    winnerPlayerId?: number;
    winnerDisplayName?: string;
    scoreJson?: any;
  }) {
    const session = await this.prisma.playSession.findUnique({ where: { id: sessionId } });
    if (!session || !session.endedAt) throw new ConflictException('请先结算关台再录入战绩');

    const game = await this.prisma.game.findUnique({ where: { id: dto.gameId } });
    if (!game) throw new NotFoundException('选择的桌游不存在');

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
}

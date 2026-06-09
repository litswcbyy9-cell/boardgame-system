import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

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

  async search(q?: string, status?: string) {
    const where: any = {};
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

  async create(dto: { displayName: string; phone?: string; avatarUrl?: string; initialBalanceCents: number }) {
    if (!dto.displayName?.trim()) {
      throw new BadRequestException('会员姓名不能为空');
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

  async recharge(id: number, amountCents: number) {
    if (amountCents <= 0) throw new BadRequestException('金额必须大于 0');
    const result = await this.prisma.player.updateMany({
      where: { id, status: 'active' },
      data: {
        balanceCents: { increment: amountCents },
        totalRechargedCents: { increment: amountCents },
      },
    });
    if (result.count === 0) throw new NotFoundException('会员不存在或已停用');
    return { ok: true };
  }

  async consume(id: number, amountCents: number) {
    if (amountCents <= 0) throw new BadRequestException('金额必须大于 0');
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player || player.status !== 'active') throw new NotFoundException('会员不存在或已停用');
    if (player.balanceCents < amountCents) throw new ConflictException('会员余额不足');

    await this.prisma.player.update({
      where: { id },
      data: {
        balanceCents: { decrement: amountCents },
        totalSpentCents: { increment: amountCents },
      },
    });
    return { ok: true };
  }

  async disable(id: number) {
    const result = await this.prisma.player.updateMany({
      where: { id, status: 'active' },
      data: { status: 'disabled' },
    });
    if (result.count === 0) throw new NotFoundException('会员不存在或已停用');
    return { ok: true };
  }

  async getReservations(memberId: number) {
    return this.prisma.reservation.findMany({
      where: { playerId: memberId },
      include: { table: { select: { code: true, seatCapacity: true, areaType: true } } },
      orderBy: { reservedStart: 'desc' },
      take: 80,
    });
  }
}

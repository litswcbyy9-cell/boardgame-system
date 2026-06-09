import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MembershipLevel, PointsLogType } from '@prisma/client';

// 会员等级升级的消费门槛（单位：分）
export const MEMBERSHIP_THRESHOLDS: Record<MembershipLevel, number> = {
  bronze: 0,
  silver: 50000, // 500元
  gold: 200000, // 2000元
  platinum: 500000, // 5000元
  diamond: 1000000, // 10000元
};

// 会员等级折扣率（万分之N）
export const MEMBERSHIP_DISCOUNTS: Record<MembershipLevel, number> = {
  bronze: 10000, // 无折扣 100% (1.0)
  silver: 9700, // 3% 折扣 97% (0.97)
  gold: 9500, // 5% 折扣 95% (0.95)
  platinum: 9300, // 7% 折扣 93% (0.93)
  diamond: 9000, // 10% 折扣 90% (0.90)
};

@Injectable()
export class MemberService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateMember(tenantId: number, phone: string, displayName?: string) {
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

  async addPoints(
    tenantId: number,
    playerId: number,
    points: number,
    type: PointsLogType,
    description: string,
  ) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player || player.tenantId !== tenantId) {
      throw new Error('Player not found or tenant mismatch');
    }

    // 记录积分流水
    await this.prisma.pointsLog.create({
      data: {
        playerId,
        tenantId,
        points,
        type,
        description,
      },
    });

    // 更新玩家积分
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

  async updateMembershipLevel(tenantId: number, playerId: number) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player || player.tenantId !== tenantId) {
      return null;
    }

    const totalSpent = player.totalSpentCents;
    let newLevel: MembershipLevel = 'bronze';

    // 从高到低查找合适的等级
    if (totalSpent >= MEMBERSHIP_THRESHOLDS.diamond) {
      newLevel = 'diamond';
    } else if (totalSpent >= MEMBERSHIP_THRESHOLDS.platinum) {
      newLevel = 'platinum';
    } else if (totalSpent >= MEMBERSHIP_THRESHOLDS.gold) {
      newLevel = 'gold';
    } else if (totalSpent >= MEMBERSHIP_THRESHOLDS.silver) {
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

  async getDiscountRate(tenantId: number, playerId: number): Promise<number> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player || player.tenantId !== tenantId) {
      return 10000; // 无折扣
    }

    return MEMBERSHIP_DISCOUNTS[player.membershipLevel];
  }

  async getMemberInfo(tenantId: number, playerId: number) {
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

  async getMemberPointsHistory(tenantId: number, playerId: number, take = 50) {
    return this.prisma.pointsLog.findMany({
      where: {
        playerId,
        tenantId,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}

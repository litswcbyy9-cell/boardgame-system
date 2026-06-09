import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponType } from '@prisma/client';

interface CouponCalculationResult {
  couponId: number;
  discountCents: number;
  reason: string;
}

@Injectable()
export class CouponService {
  constructor(private prisma: PrismaService) {}

  async createCoupon(tenantId: number, data: {
    name: string;
    type: CouponType;
    value: number;
    minAmount?: number;
    totalQty: number;
    startAt: Date;
    endAt: Date;
    validOn?: 'weekday' | 'weekend' | 'all';
  }) {
    return this.prisma.coupon.create({
      data: {
        tenantId,
        name: data.name,
        type: data.type,
        value: data.value,
        minAmount: data.minAmount || 0,
        totalQty: data.totalQty,
        startAt: data.startAt,
        endAt: data.endAt,
        validOn: data.validOn || 'all',
      },
    });
  }

  async issueCoupon(tenantId: number, couponId: number, playerId: number) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id: couponId,
        tenantId,
      },
    });

    if (!coupon) throw new Error('Coupon not found');
    if (coupon.usedQty >= coupon.totalQty) {
      throw new Error('Coupon exhausted');
    }

    const now = new Date();
    if (now < coupon.startAt || now > coupon.endAt) {
      throw new Error('Coupon not in valid period');
    }

    // 检查是否已领取
    const existing = await this.prisma.memberCoupon.findUnique({
      where: {
        playerId_couponId: {
          playerId,
          couponId,
        },
      },
    });

    if (existing && existing.status !== 'expired') {
      throw new Error('Already issued to this member');
    }

    // 增加已用数量
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        usedQty: {
          increment: 1,
        },
      },
    });

    // 创建或更新会员优惠券记录
    if (existing) {
      return this.prisma.memberCoupon.update({
        where: {
          playerId_couponId: {
            playerId,
            couponId,
          },
        },
        data: {
          status: 'unused',
        },
      });
    }

    return this.prisma.memberCoupon.create({
      data: {
        playerId,
        couponId,
        status: 'unused',
      },
    });
  }

  async getMemberAvailableCoupons(tenantId: number, playerId: number) {
    const now = new Date();

    return this.prisma.memberCoupon.findMany({
      where: {
        playerId,
        status: 'unused',
        coupon: {
          tenantId,
          startAt: { lte: now },
          endAt: { gte: now },
        },
      },
      include: {
        coupon: true,
      },
      orderBy: {
        coupon: { value: 'desc' },
      },
    });
  }

  async calculateOptimalDiscount(
    tenantId: number,
    playerId: number,
    amountCents: number,
  ): Promise<CouponCalculationResult | null> {
    const coupons = await this.getMemberAvailableCoupons(tenantId, playerId);

    let bestDiscount: CouponCalculationResult | null = null;
    let maxSavings = 0;

    for (const mc of coupons) {
      const coupon = mc.coupon;

      // 检查最低消费
      if (amountCents < coupon.minAmount) continue;

      // 计算折扣
      let discount = 0;
      if (coupon.type === 'discount_fixed') {
        discount = coupon.value; // 直接扣减
      } else if (coupon.type === 'discount_percent') {
        discount = Math.floor((amountCents * coupon.value) / 10000); // value 是万分数
      }

      if (discount > maxSavings) {
        maxSavings = discount;
        bestDiscount = {
          couponId: coupon.id,
          discountCents: discount,
          reason: coupon.name,
        };
      }
    }

    return bestDiscount;
  }

  async useCoupon(tenantId: number, playerId: number, couponId: number) {
    const mc = await this.prisma.memberCoupon.findUnique({
      where: {
        playerId_couponId: {
          playerId,
          couponId,
        },
      },
      include: {
        coupon: true,
      },
    });

    if (!mc || mc.coupon.tenantId !== tenantId) {
      throw new Error('Member coupon not found');
    }

    if (mc.status !== 'unused') {
      throw new Error('Coupon already used or expired');
    }

    return this.prisma.memberCoupon.update({
      where: {
        playerId_couponId: {
          playerId,
          couponId,
        },
      },
      data: {
        status: 'used',
        usedAt: new Date(),
      },
    });
  }

  async getCouponStats(tenantId: number, couponId: number) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id: couponId,
        tenantId,
      },
      include: {
        memberCoupons: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!coupon) return null;

    const stats = {
      ...coupon,
      issuedCount: coupon.memberCoupons.length,
      usedCount: coupon.memberCoupons.filter(mc => mc.status === 'used').length,
      conversionRate: coupon.memberCoupons.length > 0
        ? (coupon.memberCoupons.filter(mc => mc.status === 'used').length / coupon.memberCoupons.length * 100).toFixed(2)
        : '0',
    };

    return stats;
  }
}

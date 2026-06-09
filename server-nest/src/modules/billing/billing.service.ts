import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponService } from '../marketing/coupon.service';
import { MemberService } from '../members/member.service';
import { v4 as uuidv4 } from 'uuid';

interface BillingLineItem {
  description: string;
  quantity: number;
  unitPrice: number; // 单位: 分
  gameId?: number;
  sessionId?: number;
}

interface BillingResult {
  orderId: number;
  orderNo: string;
  subtotalCents: number;
  discountCents: number;
  finalCents: number;
  appliedCoupon?: {
    couponId: number;
    reason: string;
  };
}

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private couponService: CouponService,
    private memberService: MemberService,
  ) {}

  async createOrder(
    tenantId: number,
    venueId: number,
    items: BillingLineItem[],
    playerId?: number,
  ): Promise<BillingResult> {
    const orderNo = `ORD-${Date.now()}-${uuidv4().substring(0, 8)}`;

    // 计算小计
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      const total = item.quantity * item.unitPrice;
      subtotal += total;
      orderItems.push({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: total,
        gameId: item.gameId,
        sessionId: item.sessionId,
      });
    }

    // 检查会员折扣和优惠券
    let membershipDiscount = 0;
    let couponDiscount = 0;
    let appliedCouponId: number | undefined;

    if (playerId) {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
      });

      if (player && player.tenantId === tenantId) {
        // 应用会员折扣
        const discountRate = await this.memberService.getDiscountRate(tenantId, playerId);
        membershipDiscount = Math.floor((subtotal * (10000 - discountRate)) / 10000);

        // 应用最优优惠券
        const coupon = await this.couponService.calculateOptimalDiscount(
          tenantId,
          playerId,
          subtotal - membershipDiscount,
        );

        if (coupon) {
          couponDiscount = coupon.discountCents;
          appliedCouponId = coupon.couponId;
        }
      }
    }

    const totalDiscount = membershipDiscount + couponDiscount;
    const finalAmount = Math.max(0, subtotal - totalDiscount);

    // 创建订单
    const order = await this.prisma.order.create({
      data: {
        tenantId,
        venueId,
        playerId,
        orderNo,
        amountCents: subtotal,
        discountCents: totalDiscount,
        finalCents: finalAmount,
        status: 'pending',
        items: {
          create: orderItems,
        },
      },
    });

    // 如果使用了优惠券，标记为已用
    if (appliedCouponId && playerId) {
      await this.couponService.useCoupon(tenantId, playerId, appliedCouponId);
    }

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      subtotalCents: subtotal,
      discountCents: totalDiscount,
      finalCents: finalAmount,
      appliedCoupon: appliedCouponId
        ? { couponId: appliedCouponId, reason: '最优优惠' }
        : undefined,
    };
  }

  async getOrder(tenantId: number, orderId: number) {
    return this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId,
      },
      include: {
        items: true,
        player: {
          select: {
            id: true,
            displayName: true,
            phone: true,
          },
        },
      },
    });
  }

  async getOrderByNo(tenantId: number, orderNo: string) {
    return this.prisma.order.findFirst({
      where: {
        orderNo,
        tenantId,
      },
      include: {
        items: true,
        player: true,
      },
    });
  }

  async markOrderAsPaid(tenantId: number, orderId: number) {
    const order = await this.getOrder(tenantId, orderId);
    if (!order) throw new Error('Order not found');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        paidAt: new Date(),
      },
    });

    // 更新会员消费记录和积分
    if (order.playerId) {
      // 增加消费金额
      await this.prisma.player.update({
        where: { id: order.playerId },
        data: {
          totalSpentCents: {
            increment: order.finalCents,
          },
        },
      });

      // 添加消费积分（1元=1积分）
      const pointsToAdd = Math.floor(order.finalCents / 100);
      if (pointsToAdd > 0) {
        await this.memberService.addPoints(
          tenantId,
          order.playerId,
          pointsToAdd,
          'consume',
          `订单 ${order.orderNo} 消费`,
        );
      }

      // 更新会员等级
      await this.memberService.updateMembershipLevel(tenantId, order.playerId);
    }

    return updated;
  }

  async cancelOrder(tenantId: number, orderId: number) {
    const order = await this.getOrder(tenantId, orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'paid') {
      throw new Error('Cannot cancel paid order');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
      },
    });
  }

  async getOrderStats(tenantId: number, venueId?: number) {
    const whereClause: any = { tenantId };
    if (venueId) whereClause.venueId = venueId;

    const orders = await this.prisma.order.findMany({
      where: whereClause,
    });

    const paidOrders = orders.filter(o => o.status === 'paid');

    return {
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      totalRevenue: paidOrders.reduce((sum, o) => sum + o.finalCents, 0),
      totalDiscount: paidOrders.reduce((sum, o) => sum + o.discountCents, 0),
      avgOrderValue: paidOrders.length > 0
        ? Math.floor(paidOrders.reduce((sum, o) => sum + o.finalCents, 0) / paidOrders.length)
        : 0,
    };
  }
}

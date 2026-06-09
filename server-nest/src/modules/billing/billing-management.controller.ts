import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('billing-mgmt')
@UseGuards(JwtAuthGuard)
export class BillingManagementController {
  constructor(
    private billingService: BillingService,
    private prisma: PrismaService,
  ) {}

  @Get('orders')
  async listOrders(
    @Request() req,
    @Query('venueId') venueId?: string,
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
  ) {
    const tenantId = req.tenant.id;

    const whereClause: any = { tenantId };
    if (venueId) whereClause.venueId = parseInt(venueId);

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: {
        player: { select: { displayName: true, phone: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(take),
    });

    const total = await this.prisma.order.count({ where: whereClause });

    return {
      data: orders,
      pagination: { skip: parseInt(skip), take: parseInt(take), total },
    };
  }

  @Get('orders/:id')
  async getOrder(@Request() req, @Param('id') orderId: string) {
    const tenantId = req.tenant.id;
    return this.billingService.getOrder(tenantId, parseInt(orderId));
  }

  @Post('orders/:id/pay')
  async markOrderAsPaid(@Request() req, @Param('id') orderId: string) {
    const tenantId = req.tenant.id;
    return this.billingService.markOrderAsPaid(tenantId, parseInt(orderId));
  }

  @Get('stats')
  async getOrderStats(
    @Request() req,
    @Query('venueId') venueId?: string,
  ) {
    const tenantId = req.tenant.id;
    return this.billingService.getOrderStats(tenantId, venueId ? parseInt(venueId) : undefined);
  }

  @Get('revenue-trend')
  async getRevenueTrend(@Request() req, @Query('days') days: string = '30') {
    const tenantId = req.tenant.id;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: 'paid',
        paidAt: { gte: sinceDate },
      },
      include: { items: true },
    });

    // 按日期聚合
    const dailyRevenue: Record<string, number> = {};
    orders.forEach(order => {
      const date = order.paidAt?.toISOString().split('T')[0];
      if (date) {
        dailyRevenue[date] = (dailyRevenue[date] || 0) + order.finalCents;
      }
    });

    return {
      days: parseInt(days),
      dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({
        date,
        amountCents: amount,
        amountYuan: Math.floor(amount / 100),
      })),
      totalRevenue: orders.reduce((sum, o) => sum + o.finalCents, 0),
    };
  }
}

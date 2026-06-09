import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Controller('coupons-mgmt')
@UseGuards(JwtAuthGuard)
export class CouponManagementController {
  constructor(
    private couponService: CouponService,
    private prisma: PrismaService,
  ) {}

  @Post('create')
  async createCoupon(@Request() req, @Body() dto: CreateCouponDto) {
    const tenantId = req.tenant.id;
    return this.couponService.createCoupon(tenantId, {
      name: dto.name,
      type: dto.type,
      value: dto.value,
      minAmount: dto.minAmount,
      totalQty: dto.totalQty,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      validOn: dto.validOn,
    });
  }

  @Get('list')
  async listCoupons(
    @Request() req,
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
  ) {
    const tenantId = req.tenant.id;

    const coupons = await this.prisma.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(take),
    });

    const total = await this.prisma.coupon.count({ where: { tenantId } });

    return {
      data: coupons,
      pagination: { skip: parseInt(skip), take: parseInt(take), total },
    };
  }

  @Get(':id/stats')
  async getCouponStats(@Request() req, @Param('id') couponId: string) {
    const tenantId = req.tenant.id;
    return this.couponService.getCouponStats(tenantId, parseInt(couponId));
  }

  @Post(':couponId/issue/:playerId')
  async issueCoupon(
    @Request() req,
    @Param('couponId') couponId: string,
    @Param('playerId') playerId: string,
  ) {
    const tenantId = req.tenant.id;
    return this.couponService.issueCoupon(
      tenantId,
      parseInt(couponId),
      parseInt(playerId),
    );
  }

  @Get(':id/member-coupons')
  async getMemberCoupons(@Request() req, @Param('id') couponId: string) {
    const tenantId = req.tenant.id;

    return this.prisma.memberCoupon.findMany({
      where: {
        couponId: parseInt(couponId),
        coupon: { tenantId },
      },
      include: { player: { select: { displayName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

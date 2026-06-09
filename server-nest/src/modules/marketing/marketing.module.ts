import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CouponService } from './coupon.service';
import { CouponManagementController } from './coupon-management.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CouponManagementController],
  providers: [CouponService],
  exports: [CouponService],
})
export class MarketingModule {}

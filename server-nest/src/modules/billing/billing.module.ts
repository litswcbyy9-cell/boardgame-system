import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { BillingService } from './billing.service';
import { BillingManagementController } from './billing-management.controller';
import { MarketingModule } from '../marketing/marketing.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [PrismaModule, MarketingModule, MembersModule],
  controllers: [BillingManagementController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

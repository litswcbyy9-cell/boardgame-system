import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { BillingService } from './billing.service';
import { MarketingModule } from '../marketing/marketing.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [PrismaModule, MarketingModule, MembersModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

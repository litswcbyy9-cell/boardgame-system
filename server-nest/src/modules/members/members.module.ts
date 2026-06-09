import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { MembersController } from './members.controller';
import { MemberManagementController } from './member-management.controller';
import { MembersService } from './members.service';
import { MemberService } from './member.service';

@Module({
  imports: [PrismaModule],
  controllers: [MembersController, MemberManagementController],
  providers: [MembersService, MemberService],
  exports: [MembersService, MemberService],
})
export class MembersModule {}

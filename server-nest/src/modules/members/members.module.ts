import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MemberService } from './member.service';

@Module({
  imports: [PrismaModule],
  controllers: [MembersController],
  providers: [MembersService, MemberService],
  exports: [MembersService, MemberService],
})
export class MembersModule {}

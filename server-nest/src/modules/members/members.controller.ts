import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MembersService } from './members.service';
import { CreateMemberDto, AmountDto } from './dto/member.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('会员')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({ summary: '搜索会员列表' })
  async search(@Query('q') q?: string, @Query('status') status?: string) {
    return this.membersService.search(q, status);
  }

  @Post()
  @ApiOperation({ summary: '新增会员' })
  async create(@Body() dto: CreateMemberDto) {
    const amountCents = Math.round(dto.initialBalanceYuan * 100);
    return this.membersService.create({ ...dto, initialBalanceCents: amountCents });
  }

  @Get(':id/reservations')
  @ApiOperation({ summary: '查看会员预约记录' })
  async getReservations(@Param('id') id: string) {
    return this.membersService.getReservations(Number(id));
  }

  @Post(':id/recharge')
  @ApiOperation({ summary: '会员充值' })
  async recharge(@Param('id') id: string, @Body() dto: AmountDto) {
    const amountCents = Math.round(dto.amountYuan * 100);
    return this.membersService.recharge(Number(id), amountCents);
  }

  @Post(':id/consume')
  @ApiOperation({ summary: '会员扣费' })
  async consume(@Param('id') id: string, @Body() dto: AmountDto) {
    const amountCents = Math.round(dto.amountYuan * 100);
    return this.membersService.consume(Number(id), amountCents);
  }

  @Delete(':id')
  @ApiOperation({ summary: '停用会员' })
  async disable(@Param('id') id: string) {
    return this.membersService.disable(Number(id));
  }
}

import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('预约')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: '获取待处理预约列表' })
  async findAll() {
    return this.reservationsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '创建预约（员工端）' })
  async create(@Body() body: any) {
    return this.reservationsService.create(body);
  }

  @Public()
  @Post('public')
  @ApiOperation({ summary: '创建预约（顾客自助端）' })
  async publicReserve(@Body() body: any) {
    return this.reservationsService.publicReservation(body);
  }

  @Post(':id/checkin')
  @ApiOperation({ summary: '预约签到 → 开台' })
  async checkin(@Param('id') id: string) {
    return this.reservationsService.checkin(Number(id));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消预约' })
  async cancel(@Param('id') id: string) {
    return this.reservationsService.cancel(Number(id));
  }
}

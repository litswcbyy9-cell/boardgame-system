import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService } from './tables.service';

@ApiTags('桌位')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @ApiOperation({ summary: '获取桌位平面图及实时状态' })
  async getFloor() {
    return this.tablesService.getFloorStatus();
  }

  @Get('match')
  @ApiOperation({ summary: '按人数和时段匹配可用桌位' })
  async matchTables(
    @Query('partySize') partySize = '4',
    @Query('startAt') startAt: string,
    @Query('endAt') endAt: string,
  ) {
    const size = Math.max(1, Math.min(20, Number(partySize)));
    return this.tablesService.matchTables(size, startAt, endAt);
  }
}

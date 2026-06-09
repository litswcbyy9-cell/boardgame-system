import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('报表')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @ApiOperation({ summary: '今日收入报表' })
  async revenue(@Query('date') date?: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.reportsService.dailyRevenue(d);
  }

  @Get('game-popularity')
  @ApiOperation({ summary: '桌游热度排行' })
  async gamePopularity(@Query('days') days?: string) {
    const d = Math.min(365, Math.max(1, Number(days || '30')));
    return this.reportsService.gamePopularity(d);
  }

  @Get('table-utilization')
  @ApiOperation({ summary: '桌位利用率' })
  async tableUtilization(@Query('days') days?: string) {
    const d = Math.min(365, Math.max(1, Number(days || '30')));
    return this.reportsService.tableUtilization(d);
  }
}

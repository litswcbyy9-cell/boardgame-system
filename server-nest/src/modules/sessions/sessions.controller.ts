import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';

@ApiTags('开台对局')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('open')
  @ApiOperation({ summary: '获取所有进行中的对局' })
  async findOpen() {
    return this.sessionsService.findOpen();
  }

  @Post('walkin')
  @ApiOperation({ summary: '现场开台' })
  async walkin(@Body() body: any) {
    return this.sessionsService.walkin(body);
  }

  @Post(':id/settle')
  @ApiOperation({ summary: '结算关台' })
  async settle(
    @Param('id') id: string,
    @Body() body: { billedMinutes: number; amountCents: number; notes?: string },
  ) {
    return this.sessionsService.settle(Number(id), body.billedMinutes, body.amountCents, body.notes);
  }

  @Post(':id/game-records')
  @ApiOperation({ summary: '录入战绩' })
  async addGameRecord(@Param('id') id: string, @Body() body: any) {
    return this.sessionsService.addGameRecord(Number(id), body);
  }
}

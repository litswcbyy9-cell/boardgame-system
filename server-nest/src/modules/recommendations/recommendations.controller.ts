import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';

@ApiTags('智能推荐')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get('games')
  @ApiOperation({ summary: '智能推荐桌游（基于人数/时长/偏好/历史）' })
  async recommendGames(
    @Query('playerId') playerId?: string,
    @Query('partySize') partySize = '4',
    @Query('minutes') minutes = '120',
    @Query('category') category?: string,
  ) {
    return this.recommendationsService.recommendGames({
      playerId: playerId ? Number(playerId) : null,
      partySize: Math.max(1, Math.min(20, Number(partySize))),
      minutes: Math.max(10, Math.min(600, Number(minutes))),
      category,
    });
  }

  @Get('tables')
  @ApiOperation({ summary: '智能推荐桌位（按人数和时段）' })
  async recommendTables(
    @Query('partySize') partySize = '4',
    @Query('startAt') startAt: string,
    @Query('endAt') endAt: string,
  ) {
    return this.recommendationsService.recommendTables(
      Math.max(1, Math.min(20, Number(partySize))),
      startAt,
      endAt,
    );
  }
}

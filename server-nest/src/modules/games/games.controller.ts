import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';

@ApiTags('桌游')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOperation({ summary: '获取桌游目录' })
  async findAll() {
    return this.gamesService.findAll();
  }

  @Get('leaderboard')
  @ApiOperation({ summary: '会员战绩排行榜' })
  async leaderboard() {
    return this.gamesService.getLeaderboard();
  }
}

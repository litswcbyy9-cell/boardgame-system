import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TablesService } from '../tables/tables.service';

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private tablesService: TablesService,
  ) {}

  async recommendGames(dto: {
    playerId?: number | null;
    partySize: number;
    minutes: number;
    category?: string;
  }) {
    const playerId = dto.playerId || null;
    const partySize = dto.partySize;
    const minutes = dto.minutes;
    const category = (dto.category || '').trim();

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        game_id AS gameId, title, cover_image_url AS coverImageUrl,
        min_players AS minPlayers, max_players AS maxPlayers,
        category, difficulty_level AS difficultyLevel, avg_minutes AS avgMinutes,
        total_play_records AS totalPlayRecords, recent_30_records AS recent30Records,
        people_score AS peopleScore, duration_score AS durationScore,
        category_score AS categoryScore, history_score AS historyScore,
        hot_score AS hotScore, weight_score AS weightScore,
        ROUND(
          people_score * 0.25 + duration_score * 0.15 + category_score * 0.15
          + history_score * 0.20 + hot_score * 0.15 + weight_score * 0.10, 2
        ) AS score
      FROM (
        SELECT
          f.game_id, f.title, f.cover_image_url, f.min_players, f.max_players,
          f.category, f.difficulty_level, f.avg_minutes,
          f.total_play_records, f.recent_30_records,
          CASE
            WHEN ${partySize} BETWEEN f.min_players AND f.max_players THEN 100
            WHEN ${partySize} < f.min_players
              THEN GREATEST(0, 100 - (CAST(f.min_players AS SIGNED) - ${partySize}) * 25)
            ELSE GREATEST(0, 100 - (${partySize} - CAST(f.max_players AS SIGNED)) * 30)
          END AS people_score,
          GREATEST(0, 100 - ROUND(
            ABS(CAST(f.avg_minutes AS SIGNED) - ${minutes}) * 100
            / GREATEST(${minutes}, f.avg_minutes, 1), 2
          )) AS duration_score,
          CASE WHEN '' = '' THEN 70 WHEN f.category = ${category || ''} THEN 100 ELSE 45 END AS category_score,
          CASE
            WHEN ${playerId} IS NULL THEN 50
            WHEN IFNULL(pg.player_game_records, 0) > 0 THEN 100
            WHEN IFNULL(pc.player_category_records, 0) > 0 THEN 75
            ELSE 45
          END AS history_score,
          LEAST(100, f.recent_30_records * 8 + f.total_play_records * 0.5) AS hot_score,
          LEAST(100, f.recommend_weight * 20) AS weight_score
        FROM v_game_recommendation_features f
        LEFT JOIN (
          SELECT gr.game_id, COUNT(*) AS player_game_records
          FROM game_records gr WHERE gr.winner_player_id = ${playerId}
          GROUP BY gr.game_id
        ) pg ON pg.game_id = f.game_id
        LEFT JOIN (
          SELECT g.category, COUNT(*) AS player_category_records
          FROM game_records gr INNER JOIN games g ON g.id = gr.game_id
          WHERE gr.winner_player_id = ${playerId} GROUP BY g.category
        ) pc ON pc.category = f.category
      ) scored
      ORDER BY score DESC, people_score DESC, recent_30_records DESC, recommend_weight DESC, title ASC
      LIMIT 5
    `;

    return rows.map((row: any) => ({
      gameId: Number(row.gameId),
      title: row.title,
      coverImageUrl: row.coverImageUrl,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      category: row.category,
      difficultyLevel: row.difficultyLevel,
      avgMinutes: row.avgMinutes,
      totalPlayRecords: Number(row.totalPlayRecords),
      recent30Records: Number(row.recent30Records),
      score: Number(row.score),
      scores: {
        people: Number(row.peopleScore),
        duration: Number(row.durationScore),
        category: Number(row.categoryScore),
        history: Number(row.historyScore),
        hot: Number(row.hotScore),
        weight: Number(row.weightScore),
      },
      reason: this.buildGameReason(row, dto),
    }));
  }

  async recommendTables(partySize: number, startAt: string, endAt: string) {
    return this.tablesService.matchTables(partySize, startAt, endAt);
  }

  private buildGameReason(row: any, query: any): string {
    const parts: string[] = [];
    if (Number(row.peopleScore) >= 90) parts.push(`适合 ${query.partySize} 人`);
    else parts.push('人数略有偏差但仍可安排');
    if (Number(row.durationScore) >= 80) parts.push(`时长接近 ${query.minutes} 分钟`);
    if (query.category && row.category === query.category) parts.push(`匹配${row.category}偏好`);
    if (Number(row.historyScore) >= 90) parts.push('会员历史记录高度匹配');
    else if (Number(row.historyScore) >= 70) parts.push('会员曾偏好同类游戏');
    if (Number(row.hotScore) >= 50) parts.push('近期热度较高');
    if (!parts.length) parts.push('综合人数、时长和门店权重后排序靠前');
    return parts.join('，') + '。';
  }
}

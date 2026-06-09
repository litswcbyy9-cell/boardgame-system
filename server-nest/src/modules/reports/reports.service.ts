import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dailyRevenue(date: string) {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT
        ${date} AS reportDay,
        ROUND(IFNULL(SUM(s.amount_cents), 0) / 100, 2) AS revenueYuan,
        COUNT(*) AS settledSessions,
        IFNULL(SUM(s.billed_minutes), 0) AS totalBilledMinutes
      FROM play_sessions s
      WHERE s.ended_at IS NOT NULL
        AND DATE(s.ended_at) = ${date}
    `;
    return result[0] || null;
  }

  async gamePopularity(days = 30) {
    return this.prisma.$queryRaw<any[]>`
      SELECT
        g.id AS gameId, g.title, g.cover_image_url AS coverImageUrl,
        COUNT(gr.id) AS recordCount
      FROM games g
      LEFT JOIN game_records gr ON gr.game_id = g.id
        AND gr.played_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
      GROUP BY g.id, g.title, g.cover_image_url
      ORDER BY recordCount DESC, g.title ASC
    `;
  }

  async tableUtilization(days = 30) {
    return this.prisma.$queryRaw<any[]>`
      SELECT
        t.id AS tableId, t.code,
        COUNT(s.id) AS settledSessionsInRange
      FROM game_tables t
      LEFT JOIN play_sessions s ON s.table_id = t.id
        AND s.ended_at IS NOT NULL
        AND s.ended_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
      GROUP BY t.id, t.code
      ORDER BY settledSessionsInRange DESC, t.code ASC
    `;
  }
}

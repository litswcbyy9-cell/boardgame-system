import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.game.findMany({
      select: {
        id: true,
        title: true,
        coverImageUrl: true,
        rulesPdfUrl: true,
        minPlayers: true,
        maxPlayers: true,
        category: true,
        difficultyLevel: true,
        avgMinutes: true,
        recommendWeight: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async getLeaderboard(limit = 50) {
    return this.prisma.$queryRaw<any[]>`
      SELECT
        p.id AS playerId,
        p.display_name AS displayName,
        p.avatar_url AS avatarUrl,
        ps.wins,
        ps.games,
        CASE WHEN ps.games = 0 THEN 0 ELSE ROUND(ps.wins / ps.games, 4) END AS winRate,
        ps.last_win_at AS lastWinAt
      FROM players p
      INNER JOIN player_stats ps ON ps.player_id = p.id
      WHERE p.status = 'active'
      ORDER BY winRate DESC, wins DESC, games DESC
      LIMIT ${limit}
    `;
  }
}

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let GamesService = class GamesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
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
        return this.prisma.$queryRaw `
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
};
exports.GamesService = GamesService;
exports.GamesService = GamesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GamesService);
//# sourceMappingURL=games.service.js.map
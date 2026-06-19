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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let ReportsService = class ReportsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async dailyRevenue(date) {
        const result = await this.prisma.$queryRaw `
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
        return this.prisma.$queryRaw `
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
        return this.prisma.$queryRaw `
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map
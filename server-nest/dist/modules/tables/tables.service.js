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
exports.TablesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
let TablesService = class TablesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getFloorStatus() {
        const tables = await this.prisma.gameTable.findMany({
            include: {
                tableState: true,
                venue: { select: { name: true, address: true, logoUrl: true } },
            },
            orderBy: { sortOrder: 'asc' },
        });
        return tables.map(t => {
            const state = t.tableState;
            return {
                id: t.id,
                code: t.code,
                venueId: t.venueId,
                posX: t.posX,
                posY: t.posY,
                sortOrder: t.sortOrder,
                seatCapacity: t.seatCapacity,
                areaType: t.areaType,
                floorPhotoUrl: t.floorPhotoUrl,
                status: state?.status || 'idle',
                currentReservationId: state?.currentReservationId || null,
                currentSessionId: state?.currentSessionId || null,
            };
        });
    }
    async matchTables(partySize, startAt, endAt) {
        const tables = await this.prisma.$queryRaw `
      SELECT
        t.id AS tableId, t.code, t.seat_capacity AS seatCapacity,
        t.area_type AS areaType, t.pos_x AS posX, t.pos_y AS posY,
        gts.status,
        IFNULL(u.recent_sessions, 0) AS recentSessions,
        CASE
          WHEN t.seat_capacity >= ${partySize} THEN GREATEST(0, 100 - (t.seat_capacity - ${partySize}) * 12)
          ELSE GREATEST(0, 100 - (${partySize} - t.seat_capacity) * 35)
        END AS capacityScore,
        CASE WHEN gts.status = 'idle' THEN 100 WHEN gts.status = 'reserved' THEN 75 ELSE 0 END AS availabilityScore,
        GREATEST(40, 100 - IFNULL(u.recent_sessions, 0) * 3) AS utilizationScore,
        ROUND(
          capacityScore * 0.55 + availabilityScore * 0.25 + utilizationScore * 0.20, 2
        ) AS score
      FROM game_tables t
      INNER JOIN game_table_state gts ON gts.table_id = t.id
      LEFT JOIN (
        SELECT s.table_id, COUNT(*) AS recent_sessions
        FROM play_sessions s
        WHERE s.ended_at IS NOT NULL AND s.ended_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY s.table_id
      ) u ON u.table_id = t.id
      WHERE gts.status <> 'occupied'
        AND t.seat_capacity >= ${partySize}
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.table_id = t.id
            AND r.status IN ('pending', 'active')
            AND NOT (${endAt} <= r.reserved_start OR ${startAt} >= r.reserved_end)
        )
      ORDER BY score DESC, capacityScore DESC, t.code ASC
      LIMIT 5
    `;
        return tables.map((row) => ({
            tableId: Number(row.tableId),
            code: row.code,
            seatCapacity: Number(row.seatCapacity),
            areaType: row.areaType,
            posX: row.posX,
            posY: row.posY,
            status: row.status,
            recentSessions: Number(row.recentSessions),
            score: Number(row.score),
            scores: {
                capacity: Number(row.capacityScore),
                availability: Number(row.availabilityScore),
                utilization: Number(row.utilizationScore),
            },
            reason: this.buildTableReason(row, partySize),
        }));
    }
    buildTableReason(row, partySize) {
        const parts = [];
        if (Number(row.capacityScore) >= 90)
            parts.push(`容量适合 ${partySize} 人`);
        else
            parts.push(`容量可接待 ${partySize} 人但不是最优`);
        if (Number(row.availabilityScore) >= 95)
            parts.push('当前空闲');
        else
            parts.push('该时段无冲突预约');
        if (Number(row.utilizationScore) >= 80)
            parts.push('近期使用较均衡');
        return parts.join('，') + '。';
    }
};
exports.TablesService = TablesService;
exports.TablesService = TablesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TablesService);
//# sourceMappingURL=tables.service.js.map
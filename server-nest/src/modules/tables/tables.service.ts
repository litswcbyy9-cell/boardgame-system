import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  /** 桌位平面图状态（含当前预约/开台信息） */
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

  /** 根据人数和时段匹配空闲桌位 */
  async matchTables(partySize: number, startAt: string, endAt: string) {
    // 冲突检测：该时段内无 pending/active 预约的桌位
    const tables = await this.prisma.$queryRaw<any[]>`
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

    return tables.map((row: any) => ({
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

  private buildTableReason(row: any, partySize: number): string {
    const parts: string[] = [];
    if (Number(row.capacityScore) >= 90) parts.push(`容量适合 ${partySize} 人`);
    else parts.push(`容量可接待 ${partySize} 人但不是最优`);
    if (Number(row.availabilityScore) >= 95) parts.push('当前空闲');
    else parts.push('该时段无冲突预约');
    if (Number(row.utilizationScore) >= 80) parts.push('近期使用较均衡');
    return parts.join('，') + '。';
  }
}

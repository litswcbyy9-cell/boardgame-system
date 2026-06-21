import { pool } from './db.js';
import { hashPassword } from './security.js';

const MARK = 'presentation-demo';
const CUSTOMER_PASSWORD = 'demo12345';

function dt(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dateOnly(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function columnSet(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return new Set(rows.map((row) => row.name));
}

async function tableExists(conn, table) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return Number(row.cnt) > 0;
}

function pick(values, columns) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => columns.has(key)));
}

async function insertOrUpdate(conn, table, idColumn, id, values) {
  const entries = Object.entries(values);
  if (!entries.length) return id;
  if (id) {
    await conn.query(
      `UPDATE ${table} SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE ${idColumn}=?`,
      [...entries.map(([, value]) => value), id]
    );
    return id;
  }
  const [result] = await conn.query(
    `INSERT INTO ${table} (${entries.map(([key]) => key).join(', ')})
     VALUES (${entries.map(() => '?').join(', ')})`,
    entries.map(([, value]) => value)
  );
  return result.insertId;
}

async function upsertPlayer(conn, columns, player, passwordHash = null) {
  const [[existing]] = await conn.query(
    `SELECT id FROM players
     WHERE member_no = ? OR phone = ?
     ORDER BY id ASC
     LIMIT 1`,
    [player.memberNo, player.phone]
  );
  const values = pick(
    {
      tenant_id: 1,
      member_no: player.memberNo,
      display_name: player.name,
      phone: player.phone,
      password_hash: passwordHash,
      last_login_at: dt(-20),
      avatar_url: player.avatarUrl,
      balance_cents: player.balanceCents,
      total_recharged_cents: player.rechargedCents,
      total_spent_cents: player.spentCents,
      membershipLevel: player.level,
      points: player.points,
      birthday: player.birthday,
      status: 'active',
    },
    columns
  );
  return insertOrUpdate(conn, 'players', 'id', existing?.id, values);
}

async function upsertGame(conn, columns, game) {
  const [[existing]] = await conn.query('SELECT id FROM games WHERE title = ? LIMIT 1', [game.title]);
  const values = pick(
    {
      tenant_id: 1,
      title: game.title,
      cover_image_url: game.coverImageUrl,
      rules_pdf_url: null,
      min_players: game.minPlayers,
      max_players: game.maxPlayers,
      category: game.category,
      description: game.description,
      publisher: game.publisher,
      publish_year: game.publishYear,
      difficulty_level: game.difficulty,
      avg_minutes: game.avgMinutes,
      recommend_weight: game.weight,
    },
    columns
  );
  return insertOrUpdate(conn, 'games', 'id', existing?.id, values);
}

async function upsertReservation(conn, columns, reservation) {
  const [[existing]] = await conn.query(
    `SELECT id FROM reservations
     WHERE guest_phone = ? AND guest_name = ?
     ORDER BY id DESC
     LIMIT 1`,
    [reservation.guestPhone, reservation.guestName]
  );
  const values = pick(
    {
      tenant_id: 1,
      table_id: reservation.tableId,
      player_id: reservation.playerId,
      guest_name: reservation.guestName,
      guest_phone: reservation.guestPhone,
      party_size: reservation.partySize,
      reserved_start: reservation.startAt,
      reserved_end: reservation.endAt,
      status: reservation.status,
    },
    columns
  );
  return insertOrUpdate(conn, 'reservations', 'id', existing?.id, values);
}

async function upsertSession(conn, columns, session) {
  const [[existing]] = await conn.query(
    `SELECT id FROM play_sessions
     WHERE notes = ?
     ORDER BY id DESC
     LIMIT 1`,
    [session.notes]
  );
  const values = pick(
    {
      tenant_id: 1,
      table_id: session.tableId,
      reservation_id: session.reservationId,
      guest_name: session.guestName,
      guest_phone: session.guestPhone,
      party_size: session.partySize,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      billed_minutes: session.billedMinutes,
      amount_cents: session.amountCents,
      notes: session.notes,
    },
    columns
  );
  return insertOrUpdate(conn, 'play_sessions', 'id', existing?.id, values);
}

async function upsertGameRecord(conn, columns, record) {
  const [[existing]] = await conn.query('SELECT id FROM game_records WHERE session_id = ? LIMIT 1', [record.sessionId]);
  const values = pick(
    {
      tenant_id: 1,
      session_id: record.sessionId,
      game_id: record.gameId,
      title_snapshot: record.title,
      winner_player_id: record.winnerPlayerId,
      winner_display_name: record.winnerName,
      score_json: JSON.stringify({ source: MARK, players: record.players, note: record.note }),
      played_at: record.playedAt,
    },
    columns
  );
  return insertOrUpdate(conn, 'game_records', 'id', existing?.id, values);
}

async function upsertCopy(conn, copy) {
  const [[game]] = await conn.query('SELECT id FROM games WHERE title = ? LIMIT 1', [copy.gameTitle]);
  if (!game) return null;
  const [[existing]] = await conn.query('SELECT id FROM game_copies WHERE barcode = ? LIMIT 1', [copy.barcode]);
  const values = {
    game_id: game.id,
    barcode: copy.barcode,
    status: copy.status,
    condition_note: copy.conditionNote,
    location: copy.location,
    deposit_cents: copy.depositCents,
  };
  return insertOrUpdate(conn, 'game_copies', 'id', existing?.id, values);
}

async function upsertLoan(conn, loan) {
  const [[copy]] = await conn.query(
    `SELECT c.id, c.game_id
     FROM game_copies c
     WHERE c.barcode = ?
     LIMIT 1`,
    [loan.barcode]
  );
  if (!copy) return null;
  const [[existing]] = await conn.query('SELECT id FROM game_loans WHERE notes = ? LIMIT 1', [loan.notes]);
  const values = {
    copy_id: copy.id,
    game_id: copy.game_id,
    player_id: loan.playerId,
    staff_id: null,
    borrowed_at: loan.borrowedAt,
    due_at: loan.dueAt,
    returned_at: loan.returnedAt,
    deposit_cents: loan.depositCents,
    status: loan.status,
    notes: loan.notes,
  };
  const id = await insertOrUpdate(conn, 'game_loans', 'id', existing?.id, values);
  await conn.query("UPDATE game_copies SET status = IF(? = 'active', 'lent', status) WHERE id = ?", [loan.status, copy.id]);
  return id;
}

async function upsertOrder(conn, order) {
  const [[existing]] = await conn.query(
    'SELECT id FROM orders WHERE tenant_id = 1 AND order_no = ? LIMIT 1',
    [order.orderNo]
  );
  const values = {
    tenant_id: 1,
    venue_id: 1,
    player_id: order.playerId,
    order_no: order.orderNo,
    amount_cents: order.amountCents,
    discount_cents: order.discountCents,
    final_cents: order.finalCents,
    status: 'paid',
    paid_at: order.paidAt,
  };
  const orderId = await insertOrUpdate(conn, 'orders', 'id', existing?.id, values);
  await conn.query(
    `UPDATE orders
     SET created_at = ?
     WHERE id = ?`,
    [order.paidAt, orderId]
  );
  return orderId;
}

async function seed() {
  const conn = await pool.getConnection();
  const playerColumns = await columnSet(conn, 'players');
  const gameColumns = await columnSet(conn, 'games');
  const reservationColumns = await columnSet(conn, 'reservations');
  const sessionColumns = await columnSet(conn, 'play_sessions');
  const recordColumns = await columnSet(conn, 'game_records');
  const hasRental = await tableExists(conn, 'game_copies') && await tableExists(conn, 'game_loans');
  const hasOrders = await tableExists(conn, 'orders');
  const hasAiInteractions = await tableExists(conn, 'ai_interactions');
  const passwordHash = await hashPassword(CUSTOMER_PASSWORD);

  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE play_sessions
       SET ended_at = IFNULL(ended_at, NOW()),
           billed_minutes = IFNULL(billed_minutes, GREATEST(30, TIMESTAMPDIFF(MINUTE, started_at, NOW()))),
           amount_cents = IF(amount_cents = 0, 12800, amount_cents)
       WHERE notes LIKE ? AND ended_at IS NULL`,
      [`${MARK}#open-%`]
    );

    const players = [
      { memberNo: 'DEMO2026001', name: '林鹿', phone: '19900061001', level: 'diamond', points: 3880, balanceCents: 46800, rechargedCents: 168800, spentCents: 142600, birthday: '1998-06-08', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=linlu' },
      { memberNo: 'DEMO2026002', name: '老周', phone: '19900061002', level: 'platinum', points: 2560, balanceCents: 32600, rechargedCents: 118800, spentCents: 98600, birthday: '1995-10-12', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=zhou' },
      { memberNo: 'DEMO2026003', name: '鱼丸', phone: '19900061003', level: 'gold', points: 1910, balanceCents: 18800, rechargedCents: 82800, spentCents: 65400, birthday: '2000-03-21', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=yuwan' },
      { memberNo: 'DEMO2026004', name: '海盐', phone: '19900061004', level: 'gold', points: 1680, balanceCents: 15600, rechargedCents: 68800, spentCents: 53200, birthday: '1999-08-16', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=haiyan' },
      { memberNo: 'DEMO2026005', name: '木南', phone: '19900061005', level: 'silver', points: 930, balanceCents: 9800, rechargedCents: 35800, spentCents: 26800, birthday: '2001-01-27', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=munan' },
      { memberNo: 'DEMO2026006', name: '阿澈', phone: '19900061006', level: 'silver', points: 740, balanceCents: 7600, rechargedCents: 29800, spentCents: 20600, birthday: '1997-12-02', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=ache' },
      { memberNo: 'DEMO2026007', name: '小满', phone: '19900061007', level: 'bronze', points: 360, balanceCents: 5200, rechargedCents: 16800, spentCents: 9600, birthday: '2002-05-18', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=xiaoman' },
      { memberNo: 'DEMO2026008', name: '乔一', phone: '19900061008', level: 'bronze', points: 210, balanceCents: 3000, rechargedCents: 12800, spentCents: 6800, birthday: '2003-09-09', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=qiaoyi' },
    ];

    const playerIds = [];
    for (const player of players) {
      playerIds.push(await upsertPlayer(conn, playerColumns, player, passwordHash));
    }

    const games = [
      { title: '璀璨宝石', category: '家庭', minPlayers: 2, maxPlayers: 4, avgMinutes: 35, difficulty: 2, weight: 9.8, publisher: 'Space Cowboys', publishYear: 2014, coverImageUrl: 'https://upload.wikimedia.org/wikipedia/en/5/5f/Splendor-game.jpg', description: '经典资源收集与引擎构建游戏，适合新手快速上手，也适合家庭和朋友局。' },
      { title: '狼人杀', category: '聚会', minPlayers: 6, maxPlayers: 12, avgMinutes: 60, difficulty: 2, weight: 9.5, publisher: 'Lui-même', publishYear: 2001, coverImageUrl: 'https://cdn.shopify.com/s/files/1/0670/7897/9741/files/werewolves-of-millers-hollow.jpg?v=1733557361', description: '社交推理与身份隐藏游戏，适合多人聚会、生日局和破冰活动。' },
      { title: '瘟疫危机', category: '合作', minPlayers: 2, maxPlayers: 4, avgMinutes: 60, difficulty: 3, weight: 9.2, publisher: 'Z-Man Games', publishYear: 2008, coverImageUrl: 'https://upload.wikimedia.org/wikipedia/en/3/36/Pandemic_game.jpg', description: '全员合作阻止疫情扩散，强调分工、路线规划和风险管理。' },
      { title: '车票之旅', category: '家庭', minPlayers: 2, maxPlayers: 5, avgMinutes: 75, difficulty: 2, weight: 8.9, publisher: 'Days of Wonder', publishYear: 2004, coverImageUrl: 'https://upload.wikimedia.org/wikipedia/en/9/92/Ticket_to_Ride_Board_Game_Box_EN.jpg', description: '铁路线路收集与路线规划，规则直观，适合从新手到轻策略玩家。' },
      { title: '卡坦岛', category: '策略', minPlayers: 3, maxPlayers: 4, avgMinutes: 90, difficulty: 3, weight: 9.1, publisher: 'Kosmos', publishYear: 1995, coverImageUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a3/Catan-2015-boxart.jpg', description: '资源交易、道路建设与扩张竞争，是桌游馆常见的入门策略代表作。' },
      { title: '阿瓦隆', category: '聚会', minPlayers: 5, maxPlayers: 10, avgMinutes: 45, difficulty: 2, weight: 8.7, publisher: 'Indie Boards & Cards', publishYear: 2012, coverImageUrl: 'https://upload.wikimedia.org/wikipedia/en/f/f6/The_Resistance_Avalon_cover.jpg', description: '阵营推理和任务投票游戏，适合多人局和熟人局。' },
    ];

    const gameIdsByTitle = new Map();
    for (const game of games) {
      const id = await upsertGame(conn, gameColumns, game);
      gameIdsByTitle.set(game.title, id);
    }

    const [tables] = await conn.query(
      `SELECT t.id, t.code, t.seat_capacity AS seatCapacity
       FROM game_tables t
       ORDER BY t.sort_order ASC, t.id ASC
       LIMIT 8`
    );
    if (tables.length < 5) throw new Error('Need at least 5 tables for presentation demo data');

    const activeReservations = [
      { table: tables[0], playerId: playerIds[0], guestName: '林鹿生日局', guestPhone: '19900062101', partySize: Math.min(tables[0].seatCapacity, 6), startAt: dt(-120), endAt: dt(-15), status: 'active', note: `${MARK}#open-overdue`, game: '狼人杀' },
      { table: tables[1], playerId: playerIds[1], guestName: '老周策略局', guestPhone: '19900062102', partySize: Math.min(tables[1].seatCapacity, 4), startAt: dt(-70), endAt: dt(10), status: 'active', note: `${MARK}#open-due-soon`, game: '卡坦岛' },
    ];

    for (const item of activeReservations) {
      const reservationId = await upsertReservation(conn, reservationColumns, {
        tableId: item.table.id,
        playerId: item.playerId,
        guestName: item.guestName,
        guestPhone: item.guestPhone,
        partySize: item.partySize,
        startAt: item.startAt,
        endAt: item.endAt,
        status: item.status,
      });
      const sessionId = await upsertSession(conn, sessionColumns, {
        tableId: item.table.id,
        reservationId,
        guestName: item.guestName,
        guestPhone: item.guestPhone,
        partySize: item.partySize,
        startedAt: item.startAt,
        endedAt: null,
        billedMinutes: null,
        amountCents: 0,
        notes: item.note,
      });
      await conn.query("UPDATE reservations SET status = 'active' WHERE id = ?", [reservationId]);
      await conn.query(
        "UPDATE game_table_state SET status='occupied', current_reservation_id=?, current_session_id=? WHERE table_id=?",
        [reservationId, sessionId, item.table.id]
      );
    }

    const upcoming = [
      { table: tables[2], playerId: playerIds[2], guestName: '鱼丸新手团', guestPhone: '19900062103', partySize: Math.min(tables[2].seatCapacity, 4), startAt: dt(35), endAt: dt(155) },
      { table: tables[3], playerId: playerIds[3], guestName: '海盐合作局', guestPhone: '19900062104', partySize: Math.min(tables[3].seatCapacity, 4), startAt: dt(80), endAt: dt(210) },
      { table: tables[4], playerId: playerIds[4], guestName: '木南聚会局', guestPhone: '19900062105', partySize: Math.min(tables[4].seatCapacity, 8), startAt: dt(150), endAt: dt(300) },
    ];

    for (const item of upcoming) {
      const reservationId = await upsertReservation(conn, reservationColumns, {
        tableId: item.table.id,
        playerId: item.playerId,
        guestName: item.guestName,
        guestPhone: item.guestPhone,
        partySize: item.partySize,
        startAt: item.startAt,
        endAt: item.endAt,
        status: 'pending',
      });
      await conn.query(
        "UPDATE game_table_state SET status='reserved', current_reservation_id=?, current_session_id=NULL WHERE table_id=?",
        [reservationId, item.table.id]
      );
    }

    const historyRows = [
      ['history-01', tables[5] || tables[0], playerIds[0], '璀璨宝石', -50, -15, 9800, 4],
      ['history-02', tables[6] || tables[1], playerIds[1], '瘟疫危机', -190, -105, 16800, 4],
      ['history-03', tables[7] || tables[2], playerIds[2], '车票之旅', -360, -250, 20800, 5],
      ['history-04', tables[5] || tables[0], playerIds[3], '卡坦岛', -1500, -1380, 22800, 4],
      ['history-05', tables[6] || tables[1], playerIds[4], '阿瓦隆', -3000, -2910, 18800, 8],
    ];

    for (const [tag, table, winnerPlayerId, gameTitle, startOffset, endOffset, amountCents, playersCount] of historyRows) {
      const sessionId = await upsertSession(conn, sessionColumns, {
        tableId: table.id,
        reservationId: null,
        guestName: `演示已结算-${tag}`,
        guestPhone: `19900063${String(historyRows.indexOf(historyRows.find((row) => row[0] === tag)) + 1).padStart(3, '0')}`,
        partySize: Math.min(table.seatCapacity, playersCount),
        startedAt: dt(startOffset),
        endedAt: dt(endOffset),
        billedMinutes: Math.max(30, endOffset - startOffset),
        amountCents,
        notes: `${MARK}#${tag}`,
      });
      await upsertGameRecord(conn, recordColumns, {
        sessionId,
        gameId: gameIdsByTitle.get(gameTitle),
        title: gameTitle,
        winnerPlayerId,
        winnerName: players[playerIds.indexOf(winnerPlayerId)]?.name || null,
        players: playersCount,
        note: 'presentation settled session',
        playedAt: dt(endOffset),
      });
    }

    if (hasRental) {
      const copies = [
        { gameTitle: '狼人杀', barcode: 'DEMO-RENTAL-001', status: 'lent', conditionNote: '九成新，卡牌完整', location: 'A柜-聚会区', depositCents: 5000 },
        { gameTitle: '璀璨宝石', barcode: 'DEMO-RENTAL-002', status: 'lent', conditionNote: '筹码完整', location: 'B柜-家庭区', depositCents: 5000 },
        { gameTitle: '卡坦岛', barcode: 'DEMO-RENTAL-003', status: 'available', conditionNote: '新版，配件完整', location: 'B柜-策略区', depositCents: 8000 },
        { gameTitle: '车票之旅', barcode: 'DEMO-RENTAL-004', status: 'available', conditionNote: '地图轻微折痕', location: 'B柜-家庭区', depositCents: 8000 },
        { gameTitle: '瘟疫危机', barcode: 'DEMO-RENTAL-005', status: 'available', conditionNote: '已消毒', location: 'C柜-合作区', depositCents: 6000 },
        { gameTitle: '阿瓦隆', barcode: 'DEMO-RENTAL-006', status: 'maintenance', conditionNote: '缺一张任务牌，待补件', location: '维修盒', depositCents: 3000 },
      ];
      for (const copy of copies) await upsertCopy(conn, copy);
      await upsertLoan(conn, { barcode: 'DEMO-RENTAL-001', playerId: playerIds[5], borrowedAt: dt(-5 * 24 * 60), dueAt: dt(-24 * 60), returnedAt: null, depositCents: 5000, status: 'active', notes: `${MARK}#loan-overdue` });
      await upsertLoan(conn, { barcode: 'DEMO-RENTAL-002', playerId: playerIds[6], borrowedAt: dt(-2 * 24 * 60), dueAt: dt(2 * 24 * 60), returnedAt: null, depositCents: 5000, status: 'active', notes: `${MARK}#loan-active` });
    }

    if (hasOrders) {
      await upsertOrder(conn, { orderNo: 'DEMO-PRESENTATION-001', playerId: playerIds[0], amountCents: 12800, discountCents: 1800, finalCents: 11000, paidAt: dt(-40) });
      await upsertOrder(conn, { orderNo: 'DEMO-PRESENTATION-002', playerId: playerIds[2], amountCents: 9800, discountCents: 800, finalCents: 9000, paidAt: dt(-25) });
      await upsertOrder(conn, { orderNo: 'DEMO-PRESENTATION-003', playerId: playerIds[4], amountCents: 16800, discountCents: 1200, finalCents: 15600, paidAt: dt(-10) });
    }

    if (hasAiInteractions) {
      await conn.query(
        `DELETE FROM ai_interactions
         WHERE scope IN ('dashboard', 'guide')
           AND message_preview IN ('今晚有哪些运营风险？', '4个人新手适合玩什么？')`
      );
      await conn.query(
        `INSERT INTO ai_interactions (user_type, user_id, scope, message_preview, tools_json, mock, duration_ms, created_at)
         VALUES
         ('staff', 1, 'dashboard', '今晚有哪些运营风险？', CAST(? AS JSON), 0, 860, NOW()),
         ('customer', ?, 'guide', '4个人新手适合玩什么？', CAST(? AS JSON), 0, 720, NOW())
         ON DUPLICATE KEY UPDATE created_at = created_at`,
        [
          JSON.stringify([{ tool: 'daily_revenue' }, { tool: 'risk_scan' }, { tool: 'rental_scan' }]),
          playerIds[0],
          JSON.stringify([{ tool: 'available_tables' }, { tool: 'game_recommendation' }]),
        ]
      ).catch(() => {});
    }

    const stats = [
      [playerIds[0], 18, 29, 11, 1328],
      [playerIds[1], 13, 25, 12, 1276],
      [playerIds[2], 11, 19, 8, 1248],
      [playerIds[3], 10, 18, 8, 1236],
      [playerIds[4], 8, 15, 7, 1212],
      [playerIds[5], 7, 14, 7, 1204],
      [playerIds[6], 5, 11, 6, 1188],
      [playerIds[7], 4, 9, 5, 1176],
    ];
    const statColumns = await columnSet(conn, 'player_stats');
    for (const [playerId, wins, gamesPlayed, losses, elo] of stats) {
      const values = pick({
        player_id: playerId,
        wins,
        games: gamesPlayed,
        losses,
        elo_rating: elo,
        last_win_at: dt(-30),
      }, statColumns);
      await conn.query(
        `INSERT INTO player_stats (${Object.keys(values).join(', ')})
         VALUES (${Object.keys(values).map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${Object.keys(values).filter((key) => key !== 'player_id').map((key) => `${key}=VALUES(${key})`).join(', ')}`,
        Object.values(values)
      );
    }

    await conn.commit();
    console.log('[presentation-seed] ok');
    console.log(`Customer demo account: 19900061001 / ${CUSTOMER_PASSWORD}`);
    console.log(`Data date: ${dateOnly(0)}; marker: ${MARK}`);
  } catch (error) {
    await conn.rollback();
    console.error('[presentation-seed] failed:', error);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

await seed();

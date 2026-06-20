import { requestJson } from './api.js';
import {
  ADMIN_PATH,
  clientErrorMessages,
  defaultPageForLocation,
  demoData,
  isAdminPath,
  navigateIds,
  navItems,
  pageFromHash,
  pageIds,
  statusText,
  visibleNavItems,
} from './app-data.js';
import { showToast } from './components/toast.js';
import { renderScreenPage, initScreenCharts, disposeScreenCharts } from './screen.js';
import { $ } from './dom.js';
import { createInitialState } from './state.js';
import { addHours, eloTier, escapeAttr, escapeHtml, formatDateTime, formatDurationFrom, formatTime, formatTimeRange, formatWinRate, localInputToMysqlDatetime, parseAppDate, toLocalInputValue, yuan } from './format.js';
const AUTH_KEY = 'boardgame.auth.token';
const PLAYER_AUTH_KEY = 'boardgame.player.token';
const SIDEBAR_KEY = 'boardgame.sidebar.collapsed';
const ALLOW_PUBLIC_REGISTER = import.meta.env.VITE_ALLOW_PUBLIC_REGISTER === '1';
let refreshTimer = null;

const state = createInitialState({
  activePage: pageFromHash(),
  sidebarCollapsed: window.localStorage.getItem(SIDEBAR_KEY) === '1',
  authToken: window.localStorage.getItem(AUTH_KEY) || '',
  customerToken: window.localStorage.getItem(PLAYER_AUTH_KEY) || '',
  rentalLoanDueAt: toLocalInputValue(addHours(new Date(), 72)),
});

function currentPageMeta() {
  return visibleNavItems.find((item) => item.id === state.activePage) || visibleNavItems[0] || navItems[0];
}

function readableApiError(body, statusText) {
  const code = body?.error;
  return body?.message || body?.description || clientErrorMessages[code] || code || statusText || '操作失败，请稍后重试';
}

async function api(path, opts = {}) {
  return requestJson(path, opts, {
    token: () => state.authToken,
    errorMessage: readableApiError,
    networkError: '?????????????????????????',
    onUnauthorized: () => {
      state.currentUser = null;
      state.authToken = '';
      window.localStorage.removeItem(AUTH_KEY);
    },
  });
}

async function customerApi(path, opts = {}) {
  return requestJson(path, opts, {
    token: () => state.customerToken,
    errorMessage: readableApiError,
    networkError: '???????????????',
    onUnauthorized: () => setCustomerAuth('', null),
  });
}

function setAuth(token, user) {
  state.authToken = token || '';
  state.currentUser = user || null;
  if (state.authToken) window.localStorage.setItem(AUTH_KEY, state.authToken);
  else window.localStorage.removeItem(AUTH_KEY);
}

function setCustomerAuth(token, player) {
  state.customerToken = token || '';
  state.customerPlayer = player || null;
  if (state.customerToken) window.localStorage.setItem(PLAYER_AUTH_KEY, state.customerToken);
  else window.localStorage.removeItem(PLAYER_AUTH_KEY);
  if (player) {
    state.customerGuestName = player.displayName || state.customerGuestName;
    state.customerPhone = player.phone || state.customerPhone;
  }
}

async function enterAuthenticatedApp() {
  state.activePage = 'dashboard';
  const nextHash = '#/dashboard';
  if (!isAdminPath() || window.location.hash !== nextHash) {
    window.history.replaceState(null, '', `${ADMIN_PATH}${nextHash}`);
  }
  await render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function ensureRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    if (state.currentUser) void refresh();
  }, 15000);
}

function applyDemoData(errorMessage = '') {
  Object.assign(state, {
    tables: demoData.tables,
    players: demoData.players,
    members: demoData.players,
    staff: demoData.staff,
    games: demoData.games,
    gameRecommendations: demoData.gameRecommendations,
    tableRecommendations: demoData.tableRecommendations,
    reservations: demoData.reservations,
    openSessions: demoData.openSessions,
    leaderboard: demoData.leaderboard,
    popularity: demoData.popularity,
    tableUtilization: demoData.tableUtilization,
    revenue: demoData.revenue,
    maintenance: { expiredReservations: 0, autoClosedSessions: 0, overdueSessionCount: 0, overdueSessions: [], dueSoonSessions: [], reservationGraceMinutes: 15, checkedAt: new Date().toISOString() },
    aiSnapshot: null,
    aiCards: [],
    aiActions: [],
    aiToolResults: [],
    venue: demoData.venue,
    health: '演示数据',
    mode: 'demo',
    err: errorMessage,
  });
  if (!state.selectedId) state.selectedId = demoData.tables[0].id;
  if (!state.selectedMemberId) state.selectedMemberId = demoData.players[0].id;
  if (!state.selectedStaffId) state.selectedStaffId = demoData.staff[0].id;
  state.memberReservationMemberId = state.selectedMemberId;
  state.memberReservations = demoData.reservations.filter((reservation) => Number(reservation.playerId) === Number(state.selectedMemberId));
  state.memberReservationsLoading = false;
}

async function refresh() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const loadWarnings = [];
    const safeApi = async (label, promise, fallback) => {
      try {
        return await promise;
      } catch (error) {
        loadWarnings.push(`${label}：${error.message}`);
        return fallback;
      }
    };
    const maintenance = await api('/api/ops/maintenance', { method: 'POST' }).catch((error) => ({
      expiredReservations: 0,
      autoClosedSessions: 0,
      overdueSessionCount: 0,
      overdueSessions: [],
      dueSoonSessions: [],
      error: error.message,
    }));
    const [health, tables, players, members, games, reservations, openSessions, leaderboard, venue, revenue, popularity, tableUtilization, revenueTrend, aiDashboard] =
      await Promise.all([
        api('/api/health').catch((error) => ({ db: false, error: error.message })),
        api('/api/tables'),
        safeApi('会员列表', api('/api/players'), state.players || []),
        safeApi('会员管理', api(`/api/members?q=${encodeURIComponent(state.memberSearch)}`), state.members || []),
        safeApi('桌游目录', api('/api/games'), state.games || []),
        safeApi('预约记录', api('/api/reservations'), state.reservations || []),
        safeApi('进行中桌位', api('/api/sessions/open'), state.openSessions || []),
        safeApi('排行榜', api('/api/leaderboard'), state.leaderboard || []),
        safeApi('门店信息', api('/api/venue'), state.venue || null),
        safeApi('收入报表', api(`/api/reports/revenue?date=${today}`), state.revenue || []),
        safeApi('热门桌游', api('/api/reports/game-popularity?days=30'), state.popularity || []),
        safeApi('桌位利用率', api('/api/reports/table-utilization?days=30'), state.tableUtilization || []),
        safeApi('营收趋势', api('/api/reports/revenue-trend?days=30'), state.revenueTrend || []),
        api('/api/ai/dashboard-snapshot?days=30').catch(() => null),
      ]);

    Object.assign(state, {
      tables,
      players,
      members,
      staff: [],
      games,
      reservations,
      openSessions,
      leaderboard,
      venue,
      revenue,
      maintenance,
      popularity,
      tableUtilization,
      revenueTrend,
      aiSnapshot: aiDashboard?.snapshot || null,
      aiCards: aiDashboard?.cards || [],
      aiActions: aiDashboard?.actions || [],
      aiToolResults: aiDashboard?.toolResults || [],
      health: health?.db ? '数据库已连接' : 'API 可用',
      mode: 'live',
      err: loadWarnings.length ? `部分数据加载失败，已保留可用数据：${loadWarnings.slice(0, 3).join('；')}` : '',
    });
    if (!state.selectedId && tables.length) state.selectedId = tables[0].id;
    if (members.length) {
      const selectedStillVisible = members.some((member) => Number(member.id) === Number(state.selectedMemberId));
      if (!state.selectedMemberId || !selectedStillVisible) state.selectedMemberId = members[0].id;
    } else {
      state.selectedMemberId = null;
      state.memberReservations = [];
      state.memberReservationMemberId = null;
    }
    state.selectedStaffId = null;
    if (state.selectedMemberId) await loadMemberReservations(state.selectedMemberId);
  } catch (error) {
    applyDemoData(`无法连接后端，当前显示演示数据：${error.message}`);
  }
  render();
}

async function loadMemberReservations(memberId, { renderAfter = false } = {}) {
  if (!memberId) {
    state.memberReservations = [];
    state.memberReservationMemberId = null;
    state.memberReservationsLoading = false;
    return;
  }
  if (state.mode !== 'live' || !state.currentUser) {
    state.memberReservationMemberId = memberId;
    state.memberReservations = state.reservations.filter((reservation) => Number(reservation.playerId) === Number(memberId));
    state.memberReservationsLoading = false;
    if (renderAfter) render();
    return;
  }

  state.memberReservationMemberId = memberId;
  state.memberReservationsLoading = true;
  if (renderAfter) render();
  try {
    const rows = await api(`/api/members/${memberId}/reservations`);
    if (Number(state.selectedMemberId) === Number(memberId)) {
      state.memberReservations = rows;
    }
  } catch (error) {
    state.memberReservations = state.reservations.filter((reservation) => Number(reservation.playerId) === Number(memberId));
    showToast(`会员预约记录加载失败：${error.message}`, 'err');
  } finally {
    if (Number(state.selectedMemberId) === Number(memberId)) {
      state.memberReservationsLoading = false;
    }
    if (renderAfter) render();
  }
}

async function loadCustomerReservations({ renderAfter = false } = {}) {
  if (!state.customerPlayer) {
    state.customerReservations = [];
    state.customerReservationsLoading = false;
    if (renderAfter) render();
    return;
  }
  state.customerReservationsLoading = true;
  if (renderAfter) render();
  try {
    const rows = await customerApi('/api/public/me/reservations');
    state.customerReservations = Array.isArray(rows) ? rows : [];
  } catch (error) {
    state.customerReservations = [];
    showToast(`我的预约加载失败：${error.message}`, 'err');
  } finally {
    state.customerReservationsLoading = false;
    if (renderAfter) render();
  }
}

async function loadCustomerProfile() {
  if (!state.customerToken) {
    setCustomerAuth('', null);
    state.customerReservations = [];
    return;
  }
  try {
    const result = await customerApi('/api/public/auth/me');
    if (!result?.player) {
      setCustomerAuth('', null);
      state.customerReservations = [];
      return;
    }
    setCustomerAuth(state.customerToken, result.player);
    if (state.customerPlayer) await loadCustomerReservations();
  } catch {
    setCustomerAuth('', null);
    state.customerReservations = [];
  }
}

function requireLive() {
  if (state.mode !== 'live') {
    showToast('当前是演示数据，请启动后端和数据库后再执行写入操作。', 'err');
    return false;
  }
  if (!state.currentUser) {
    showToast('请先登录后再操作。', 'err');
    render();
    return false;
  }
  return true;
}

function selectedTable() {
  return state.tables.find((table) => table.id === state.selectedId) || null;
}

function selectedMember() {
  return state.members.find((member) => member.id === state.selectedMemberId) || null;
}

function selectedStaff() {
  return state.staff.find((staff) => staff.id === state.selectedStaffId) || null;
}

function reservationsForMember(memberId) {
  if (!memberId) return [];
  if (Number(state.memberReservationMemberId) === Number(memberId)) return state.memberReservations;
  return state.reservations.filter((reservation) => Number(reservation.playerId) === Number(memberId));
}

function pendingReservations() {
  return state.reservations.filter((reservation) => reservation.status === 'pending');
}

function openOnSelected() {
  const session = state.openSessions.find((item) => item.tableId === state.selectedId);
  if (session) return session;
  const table = selectedTable();
  if (!table?.currentSessionId) return null;
  return {
    id: table.currentSessionId,
    tableId: table.id,
    tableCode: table.code,
    reservationId: table.currentSessionReservationId,
    playerId: table.currentSessionPlayerId,
    playerName: table.currentSessionPlayerName,
    playerPhone: table.currentSessionPlayerPhone,
    guestName: table.currentSessionGuestName,
    guestPhone: table.currentSessionGuestPhone,
    partySize: table.currentSessionPartySize,
    startedAt: table.currentSessionStartedAt,
    reservedEnd: table.currentSessionReservedEnd,
  };
}

function reservationStatusText(status) {
  return {
    pending: '待入场',
    active: '已入场',
    completed: '已完成',
    cancelled: '已取消',
    no_show: '未到店',
  }[status] || status || '未知';
}

function reservationDisplayName(reservation) {
  const playerName = String(reservation?.playerName || '').trim();
  const guestName = String(reservation?.guestName || '').trim();
  if (playerName && guestName && playerName !== guestName) return `${playerName} · ${guestName}`;
  return playerName || guestName || '未命名预约';
}

function reservationPartySize(reservation) {
  const n = Number(reservation?.partySize ?? reservation?.currentReservationPartySize);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function sessionDisplayName(session) {
  const playerName = String(session?.playerName || '').trim();
  const guestName = String(session?.guestName || '').trim();
  if (playerName && guestName && playerName !== guestName) return `${playerName} · ${guestName}`;
  return playerName || guestName || (session?.reservationId ? '预约入场' : '现场客人');
}

function sessionPhone(session) {
  return String(session?.playerPhone || session?.guestPhone || '').trim() || '未填写';
}

function sessionPartySize(session) {
  const n = Number(session?.partySize);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function sessionTiming(session) {
  if (!session?.reservedEnd) return { label: '计时中', tone: 'info', minutesLeft: null };
  const end = parseAppDate(session.reservedEnd);
  if (!end) return { label: '计时中', tone: 'info', minutesLeft: null };
  const minutesLeft = Math.ceil((end.getTime() - Date.now()) / 60000);
  if (minutesLeft <= 0) return { label: '已超时', tone: 'warning', minutesLeft };
  if (minutesLeft <= 15) return { label: `${minutesLeft} 分钟后结束`, tone: 'warning', minutesLeft };
  return { label: '计时中', tone: 'info', minutesLeft };
}

function reservationsForTable(tableId) {
  return state.reservations
    .filter((reservation) => reservation.tableId === tableId && reservation.status === 'pending')
    .slice()
    .sort((a, b) => {
      const timeDiff = (parseAppDate(a.reservedStart)?.getTime() || 0) - (parseAppDate(b.reservedStart)?.getTime() || 0);
      return timeDiff || Number(a.id || 0) - Number(b.id || 0);
    });
}

function currentPendingForTable(table) {
  if (table?.currentReservationId && (table.currentReservationPlayerName || table.currentReservationGuestName)) {
    return {
      id: table.currentReservationId,
      tableId: table.id,
      playerId: table.currentReservationPlayerId,
      playerName: table.currentReservationPlayerName,
      playerPhone: table.currentReservationPlayerPhone,
      guestName: table.currentReservationGuestName,
      guestPhone: table.currentReservationGuestPhone,
      partySize: table.currentReservationPartySize,
      reservedStart: table.currentReservationStart,
      reservedEnd: table.currentReservationEnd,
      status: table.currentReservationStatus || 'pending',
    };
  }
  const reservations = reservationsForTable(table.id);
  if (!reservations.length) return null;
  return reservations.find((reservation) => Number(reservation.id) === Number(table.currentReservationId)) || reservations[0];
}

function pendingOnSelected() {
  return reservationsForTable(state.selectedId);
}

function counts() {
  return {
    idle: state.tables.filter((table) => table.status === 'idle').length,
    reserved: state.tables.filter((table) => table.status === 'reserved').length,
    occupied: state.tables.filter((table) => table.status === 'occupied').length,
    members: state.members.filter((member) => member.status === 'active').length,
  };
}

function areaTypeText(value) {
  return {
    standard: '标准区',
    party: '聚会区',
    private: '包间',
    quiet: '安静区',
  }[value] || value || '标准区';
}

function scoreWidth(value) {
  return `${Math.max(0, Math.min(100, Number(value || 0)))}%`;
}

function gridDims() {
  if (!state.tables.length) return { cols: 4, rows: 3 };
  return {
    cols: Math.max(...state.tables.map((table) => Number(table.posX || 0))) + 1,
    rows: Math.max(...state.tables.map((table) => Number(table.posY || 0))) + 1,
  };
}

function moneyFromRevenue() {
  const value = state.revenue?.revenue_yuan ?? state.revenue?.total_revenue_yuan ?? state.revenue?.totalRevenueYuan ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(0) : '0';
}

function healthClass() {
  if (state.mode === 'live') return 'status-pill status-pill--ok';
  if (state.mode === 'demo') return 'status-pill status-pill--warn';
  return 'status-pill';
}

function renderMetricCards(summary) {
  return [
    ['空闲桌位', summary.idle, '可立即接待', 'from-emerald-400 to-teal-500', '🪑'],
    ['预约中', summary.reserved, '等待入场', 'from-amber-400 to-orange-500', '📅'],
    ['占用中', summary.occupied, '正在计时', 'from-rose-400 to-pink-500', '⏱️'],
    ['活跃会员', summary.members, `余额合计 ${yuan(state.members.reduce((sum, m) => sum + Number(m.balanceCents || 0), 0))}`, 'from-sky-400 to-indigo-500', '👥'],
  ]
    .map(
      ([label, value, hint, grad, icon]) => `
        <section class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-lg transition-transform hover:-translate-y-1">
          <span class="absolute -right-2 -top-2 text-6xl opacity-20">${icon}</span>
          <span class="block text-sm font-medium opacity-90">${label}</span>
          <strong class="my-1 block text-4xl font-extrabold leading-none tracking-tight">${value}</strong>
          <span class="block text-xs opacity-80">${hint}</span>
        </section>`
    )
    .join('');
}

function renderFloor() {
  const dims = gridDims();
  return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-xl font-bold tracking-tight m-0">桌位平面图</h2>
        <p class="text-sm text-base-content/55 mt-0.5">${state.venue?.address ? escapeHtml(state.venue.address) : '根据实时状态安排预约、入场和结算'}</p>
      </div>
      <div class="flex items-center gap-3 text-xs font-semibold rounded-full bg-base-200 px-3 py-1.5" aria-label="桌位状态图例">
        <span class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-emerald-500"></i>空闲</span>
        <span class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-amber-500"></i>预约</span>
        <span class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-rose-500"></i>占用</span>
      </div>
    </div>
    <div class="floor" style="grid-template-columns: repeat(${dims.cols}, minmax(112px, 1fr));">
      ${state.tables
        .map((table) => {
          const activeSession = state.openSessions.find((session) => session.tableId === table.id);
          const pending = currentPendingForTable(table);
          const subtitle = activeSession
            ? `${sessionDisplayName(activeSession)} · ${sessionPartySize(activeSession)} 人 · 已开台 ${formatDurationFrom(activeSession.startedAt)}`
            : pending
              ? `${reservationDisplayName(pending)} · ${reservationPartySize(pending)} 人 · ${formatTime(pending.reservedStart)}`
              : '可预约或现场开台';
          return `
            <button class="table-tile table-tile--${table.status} ${state.selectedId === table.id ? 'is-selected' : ''}"
              style="grid-column:${Number(table.posX || 0) + 1}; grid-row:${Number(table.posY || 0) + 1};"
              data-table-id="${table.id}" type="button">
              <span class="table-topline">
                <strong>${escapeHtml(table.code)}</strong>
                <span>${statusText[table.status] || table.status}</span>
              </span>
              <span class="table-meta">${table.seatCapacity || 4} 人桌 · ${escapeHtml(areaTypeText(table.areaType))}</span>
              <span class="table-subtitle">${escapeHtml(subtitle)}</span>
            </button>`;
        })
        .join('')}
    </div>`;
}

function renderTableMatchList(matches, mode = 'staff') {
  if (!matches.length) {
    return '<div class="empty-state compact">填写人数和时间后，点击匹配空闲桌位。</div>';
  }
  const attr = mode === 'customer' ? 'data-customer-table' : 'data-match-table';
  return `
    <div class="match-list">
      ${matches
        .map(
          (table) => `
            <button class="match-row ${Number(table.tableId) === Number(state.selectedId) || Number(table.tableId) === Number(state.customerSelectedTableId) ? 'is-selected' : ''}" ${attr}="${table.tableId}" type="button">
              <span>
                <strong>${escapeHtml(table.code)}</strong>
                <small>${table.seatCapacity || 4} 人桌 · ${escapeHtml(areaTypeText(table.areaType))}</small>
              </span>
              <b>${Number(table.score || 0).toFixed(1)}</b>
            </button>`
        )
        .join('')}
    </div>`;
}

function renderTableOverview(table, openSession, pending) {
  return `
    <section class="table-detail-section">
      <div class="mini-section-head"><strong>桌位档案</strong><span>#${table.id}</span></div>
      <div class="table-facts">
        <div><span>桌位编号</span><strong>${escapeHtml(table.code)}</strong></div>
        <div><span>当前状态</span><strong>${statusText[table.status] || table.status}</strong></div>
        <div><span>建议容量</span><strong>${table.seatCapacity || 4} 人</strong></div>
        <div><span>区域类型</span><strong>${escapeHtml(areaTypeText(table.areaType))}</strong></div>
        <div><span>当前开台</span><strong>${openSession ? `#${openSession.id}` : '无'}</strong></div>
        <div><span>预约队列</span><strong>${pending.length} 组</strong></div>
      </div>
      <div class="match-hint">预约超过开始时间 15 分钟仍未入场时会自动标记未到；已入场预约超过结束时间会自动关台并释放桌位，收费仍由员工确认。</div>
    </section>`;
}

function renderCurrentUse(openSession) {
  if (!openSession) {
    return `
      <section class="table-detail-section current-use-card">
        <div class="mini-section-head"><strong>正在使用</strong><span>空闲</span></div>
        <div class="empty-state compact">当前桌位没有进行中的对局。</div>
      </section>`;
  }
  const timing = sessionTiming(openSession);

  return `
    <section class="table-detail-section current-use-card">
      <div class="mini-section-head"><strong>正在使用</strong><span class="badge ${timing.tone === 'warning' ? 'badge-warning' : 'badge-info'} badge-sm">${escapeHtml(timing.label)}</span></div>
      <div class="reservation-detail-grid">
        <div><span>使用人</span><strong>${escapeHtml(sessionDisplayName(openSession))}</strong></div>
        <div><span>联系电话</span><strong>${escapeHtml(sessionPhone(openSession))}</strong></div>
        <div><span>人数</span><strong>${sessionPartySize(openSession)} 人</strong></div>
        <div><span>来源</span><strong>${openSession.reservationId ? `预约 #${openSession.reservationId}` : '现场开台'}</strong></div>
        <div><span>开台时间</span><strong>${escapeHtml(formatDateTime(openSession.startedAt))}</strong></div>
        <div><span>预约结束</span><strong>${openSession.reservedEnd ? escapeHtml(formatDateTime(openSession.reservedEnd)) : '未设置'}</strong></div>
        <div><span>已进行</span><strong>${formatDurationFrom(openSession.startedAt)}</strong></div>
      </div>
    </section>`;
}

function renderReservationQueue(pending) {
  return `
    <section class="table-detail-section reservation-queue">
      <div class="mini-section-head"><strong>当前预约队列</strong><span>${pending.length} 组</span></div>
      ${
        pending.length
          ? `<div class="queue-list">${pending
              .map(
                (reservation, index) => `
                  <article class="reservation-card">
                    <div class="reservation-card-head">
                      <div>
                        <span class="eyebrow">队列 ${index + 1} · 预约 #${reservation.id}</span>
                        <strong>${escapeHtml(reservation.playerName || reservation.guestName || '访客')}</strong>
                      </div>
                      <span class="soft-chip">${reservationPartySize(reservation)} 人</span>
                    </div>
                    <div class="reservation-detail-grid">
                      <div><span>预约人</span><strong>${escapeHtml(reservation.playerName || reservation.guestName || '访客')}</strong></div>
                      <div><span>联系电话</span><strong>${escapeHtml(reservation.playerPhone || reservation.guestPhone || '未填写')}</strong></div>
                      <div><span>开始时间</span><strong>${escapeHtml(formatDateTime(reservation.reservedStart))}</strong></div>
                      <div><span>结束时间</span><strong>${escapeHtml(formatDateTime(reservation.reservedEnd))}</strong></div>
                      <div><span>状态</span><strong>${escapeHtml(reservationStatusText(reservation.status))}</strong></div>
                      <div><span>等待顺序</span><strong>第 ${index + 1} 组</strong></div>
                      <div class="wide"><span>预约备注</span><strong>${escapeHtml(reservation.guestName || '无')}</strong></div>
                    </div>
                    <div class="inline-actions">
                      <button class="btn btn-secondary btn-sm" data-checkin="${reservation.id}" type="button">入场</button>
                      <button class="btn btn-ghost btn-sm" data-cancel="${reservation.id}" type="button">取消/未到</button>
                    </div>
                  </article>`
              )
              .join('')}</div>`
          : '<div class="empty-state compact">当前桌位没有待入场预约。</div>'
      }
    </section>`;
}

function renderSelectedPanel() {
  const table = selectedTable();
  const openSession = openOnSelected();
  const pending = pendingOnSelected();
  if (!table) return `<div class="empty-state">选择一个桌位后，可以在这里完成预约、入场、结算和战绩录入。</div>`;

  return `
    <div class="selected-head">
      <div>
        <span class="eyebrow">当前桌位</span>
        <h2>${escapeHtml(table.code)}</h2>
      </div>
      <div class="table-status-stack">
        <span class="table-badge table-badge--${table.status}">${statusText[table.status] || table.status}</span>
        <span class="soft-chip">${table.seatCapacity || 4} 人桌 · ${escapeHtml(areaTypeText(table.areaType))}</span>
      </div>
    </div>
    ${renderTableOverview(table, openSession, pending)}
    ${renderCurrentUse(openSession)}
    ${renderReservationQueue(pending)}
    <div class="action-strip">
      <button class="btn btn-secondary" data-walkin type="button" ${table.status === 'occupied' ? 'disabled' : ''}>按当前人数现场开台</button>
      <button class="btn btn-ghost" data-refresh type="button">刷新状态</button>
    </div>
    <form class="form-grid" data-form="reserve">
      <h3>新建预约 / 桌位匹配</h3>
      <label class="field"><span>称呼</span><input class="input" data-field="guestName" value="${escapeAttr(state.guestName)}" /></label>
      <label class="field"><span>联系电话</span><input class="input" data-field="guestPhone" value="${escapeAttr(state.guestPhone)}" placeholder="访客预约建议填写" /></label>
      <label class="field">
        <span>会员</span>
        <select class="input" data-field="playerId">
          <option value="">访客预约</option>
          ${state.players.map((p) => `<option value="${p.id}" ${String(state.playerId) === String(p.id) ? 'selected' : ''}>${escapeHtml(p.displayName)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>人数</span><input class="input" type="number" min="1" max="20" data-field="partySize" value="${escapeAttr(state.partySize)}" /></label>
      <label class="field"><span>开始时间</span><input class="input" type="datetime-local" data-field="startAt" value="${escapeAttr(state.startAt)}" /></label>
      <label class="field"><span>结束时间</span><input class="input" type="datetime-local" data-field="endAt" value="${escapeAttr(state.endAt)}" /></label>
      <div class="form-actions two">
        <button class="btn btn-secondary" data-match-tables type="button">匹配空闲桌位</button>
        <button class="btn btn-primary" data-reserve type="button" ${table.status === 'occupied' ? 'disabled' : ''}>使用选中桌位提交</button>
      </div>
      <div class="match-hint">系统只推荐容量不小于当前人数、且目标时段无冲突的桌位。也可以在左侧平面图手动选择更高配置的包间。</div>
      ${renderTableMatchList(state.tableRecommendations)}
    </form>
    <form class="form-grid" data-form="settlement">
      <h3>结算关台</h3>
      ${
        openSession
          ? `<div class="session-banner"><strong>对局 #${openSession.id}</strong><span>已进行 ${formatDurationFrom(openSession.startedAt)}</span></div>
            <label class="field"><span>计费时长（分钟）</span><input class="input" type="number" min="1" data-field="billedMin" value="${escapeAttr(state.billedMin)}" /></label>
            <label class="field"><span>金额（元）</span><input class="input" inputmode="decimal" data-field="amountYuan" value="${escapeAttr(state.amountYuan)}" /></label>
            <label class="field"><span>备注</span><textarea class="input textarea" data-field="settleNotes">${escapeHtml(state.settleNotes)}</textarea></label>
            <button class="btn btn-danger full" data-settle type="button">结算关台</button>`
          : `<div class="empty-state compact">当前桌位暂无进行中的对局。</div>`
      }
    </form>`;
}

function renderMemberReservations(member) {
  if (!member) return '';
  if (state.memberReservationsLoading && Number(state.memberReservationMemberId) === Number(member.id)) {
    return `
      <section class="member-reservations">
        <div class="mini-section-head"><strong>预约记录</strong><span>正在加载</span></div>
        <div class="empty-state compact">正在读取该会员的预约详情...</div>
      </section>`;
  }

  const reservations = reservationsForMember(member.id);
  return `
    <section class="member-reservations">
      <div class="mini-section-head"><strong>预约记录</strong><span>${reservations.length} 条</span></div>
      ${
        reservations.length
          ? `<div class="member-reservation-list">${reservations
              .map(
                (reservation) => `
                  <article class="reservation-card">
                    <div class="reservation-card-head">
                      <div>
                        <span class="eyebrow">预约 #${reservation.id}</span>
                        <strong>${escapeHtml(reservation.tableCode || `桌位 ${reservation.tableId || '-'}`)}</strong>
                      </div>
                      <span class="soft-chip">${escapeHtml(reservationStatusText(reservation.status))}</span>
                    </div>
                    <div class="reservation-detail-grid">
                      <div><span>预约人</span><strong>${escapeHtml(reservationDisplayName(reservation))}</strong></div>
                      <div><span>联系电话</span><strong>${escapeHtml(reservation.playerPhone || reservation.guestPhone || member.phone || '未填写')}</strong></div>
                      <div><span>人数</span><strong>${reservationPartySize(reservation)} 人</strong></div>
                      <div><span>桌位容量</span><strong>${reservation.seatCapacity || '-'} 人桌</strong></div>
                      <div><span>开始时间</span><strong>${escapeHtml(formatDateTime(reservation.reservedStart))}</strong></div>
                      <div><span>结束时间</span><strong>${escapeHtml(formatDateTime(reservation.reservedEnd))}</strong></div>
                      <div class="wide"><span>备注 / 称呼</span><strong>${escapeHtml(reservation.guestName || '无')}</strong></div>
                    </div>
                    <div class="inline-actions">
                      <button class="btn btn-ghost btn-sm" data-reservation-table="${reservation.tableId}" type="button">查看桌位</button>
                      ${
                        reservation.status === 'pending'
                          ? `<button class="btn btn-secondary btn-sm" data-checkin="${reservation.id}" type="button">入场</button>
                             <button class="btn btn-ghost btn-sm" data-cancel="${reservation.id}" type="button">取消/未到</button>`
                          : ''
                      }
                    </div>
                  </article>`
              )
              .join('')}</div>`
          : '<div class="empty-state compact">该会员暂无预约记录。</div>'
      }
    </section>`;
}

function renderMembers() {
  const selected = selectedMember();
  const rows = state.members
    .map(
      (member) => `
        <button class="member-row ${state.selectedMemberId === member.id ? 'is-selected' : ''}" data-member-id="${member.id}" type="button">
          <img src="${escapeAttr(member.avatarUrl || `https://i.pravatar.cc/96?u=member-${member.id}`)}" alt="${escapeAttr(member.displayName)}头像" loading="lazy" />
          <span>
            <strong>${escapeHtml(member.displayName)}</strong>
            <small>${escapeHtml(member.memberNo || `#${member.id}`)} · ${escapeHtml(member.phone || '无手机号')}</small>
          </span>
          <b>${yuan(member.balanceCents)}</b>
        </button>`
    )
    .join('');

  return `
    <section class="panel members-panel" id="members">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-bold tracking-tight m-0">会员管理</h2>
          <span class="text-sm text-base-content/55">查看资料、新增会员、充值、扣费和停用会员</span>
        </div>
        <label class="form-control w-full sm:w-80">
          <span class="label-text text-xs font-semibold mb-1">搜索</span>
          <input class="input input-bordered w-full rounded-xl" data-field="memberSearch" placeholder="姓名 / 手机 / 会员号" value="${escapeAttr(state.memberSearch)}" />
        </label>
      </div>
      <div class="members-grid">
        <div class="member-list">
          ${rows || '<div class="empty-state compact">没有找到会员。</div>'}
        </div>
        <div class="member-detail">
          ${
            selected
              ? `<div class="member-profile">
                  <img src="${escapeAttr(selected.avatarUrl || `https://i.pravatar.cc/120?u=member-${selected.id}`)}" alt="${escapeAttr(selected.displayName)}头像" />
                  <div>
                    <span class="eyebrow">${escapeHtml(selected.memberNo || `#${selected.id}`)}</span>
                    <h3>${escapeHtml(selected.displayName)}</h3>
                    <p>${escapeHtml(selected.phone || '未填写手机号')} · ${selected.status === 'disabled' ? '已停用' : '正常会员'}</p>
                  </div>
                </div>
                <div class="member-stats">
                  <div><span>余额</span><strong>${yuan(selected.balanceCents)}</strong></div>
                  <div><span>累计充值</span><strong>${yuan(selected.totalRechargedCents)}</strong></div>
                  <div><span>累计消费</span><strong>${yuan(selected.totalSpentCents)}</strong></div>
                </div>
                <label class="field"><span>金额（元）</span><input class="input" inputmode="decimal" data-field="memberAmount" value="${escapeAttr(state.memberAmount)}" /></label>
                <div class="action-strip">
                  <button class="btn btn-primary" data-member-recharge="${selected.id}" type="button">充值</button>
                  <button class="btn btn-secondary" data-member-consume="${selected.id}" type="button">扣费</button>
                  <button class="btn btn-ghost" data-member-delete="${selected.id}" type="button">停用</button>
                </div>
                ${renderMemberReservations(selected)}`
              : '<div class="empty-state">选择左侧会员后，可以查看余额并进行充值或扣费。</div>'
          }
          <form class="form-grid member-create">
            <h3>新增会员</h3>
            <label class="field"><span>姓名</span><input class="input" data-field="newMemberName" value="${escapeAttr(state.newMemberName)}" placeholder="例如：小满" /></label>
            <label class="field"><span>手机号</span><input class="input" data-field="newMemberPhone" value="${escapeAttr(state.newMemberPhone)}" placeholder="例如：13800010001" /></label>
            <label class="field"><span>初始余额（元）</span><input class="input" inputmode="decimal" data-field="newMemberBalance" value="${escapeAttr(state.newMemberBalance)}" /></label>
            <button class="btn btn-primary full" data-member-create type="button">新增会员</button>
          </form>
        </div>
      </div>
    </section>`;
}

function renderStaffPage() {
  const selected = selectedStaff();
  const canAdmin = state.currentUser?.role === 'admin';
  const rows = state.staff
    .map(
      (staff) => `
        <button class="member-row ${state.selectedStaffId === staff.id ? 'is-selected' : ''}" data-staff-id="${staff.id}" type="button">
          <span class="staff-avatar">${escapeHtml(String(staff.fullName || '?').slice(0, 1))}</span>
          <span>
            <strong>${escapeHtml(staff.fullName)}</strong>
            <small>${escapeHtml(staff.employeeNo || `#${staff.id}`)} · ${escapeHtml(staff.position || '店员')} · ${staff.status === 'disabled' ? '已停用' : '在职'}</small>
          </span>
          <b>${escapeHtml(staff.username || '未开通')}</b>
        </button>`
    )
    .join('');

  return `
    <section class="panel members-panel staff-panel" id="staff">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-bold tracking-tight m-0">员工管理</h2>
          <span class="text-sm text-base-content/55">员工号是门店业务身份；后台账号只负责登录和权限。</span>
        </div>
        <label class="form-control w-full sm:w-80">
          <span class="label-text text-xs font-semibold mb-1">搜索</span>
          <input class="input input-bordered w-full rounded-xl" data-field="staffSearch" placeholder="姓名 / 手机 / 员工号 / 账号" value="${escapeAttr(state.staffSearch)}" />
        </label>
      </div>
      <div class="members-grid">
        <div class="member-list">
          ${rows || '<div class="empty-state compact">没有找到员工。</div>'}
        </div>
        <div class="member-detail">
          ${
            selected
              ? `<div class="member-profile staff-profile">
                  <span class="staff-avatar large">${escapeHtml(String(selected.fullName || '?').slice(0, 1))}</span>
                  <div>
                    <span class="eyebrow">${escapeHtml(selected.employeeNo || `#${selected.id}`)}</span>
                    <h3>${escapeHtml(selected.fullName)}</h3>
                    <p>${escapeHtml(selected.phone || '未填写手机号')} · ${escapeHtml(selected.position || '店员')} · ${selected.status === 'disabled' ? '已停用' : '在职'}</p>
                  </div>
                </div>
                <div class="member-stats">
                  <div><span>员工号</span><strong>${escapeHtml(selected.employeeNo || '-')}</strong></div>
                  <div><span>后台账号</span><strong>${escapeHtml(selected.username || '未开通')}</strong></div>
                  <div><span>权限角色</span><strong>${escapeHtml(selected.role || '无')}</strong></div>
                </div>
                ${
                  canAdmin
                    ? `<form class="form-grid member-create">
                        <h3>编辑员工档案</h3>
                        <label class="field"><span>员工姓名</span><input class="input" data-field="editStaffName" value="${escapeAttr(state.editStaffName || selected.fullName || '')}" placeholder="${escapeAttr(selected.fullName || '')}" /></label>
                        <label class="field"><span>手机号</span><input class="input" data-field="editStaffPhone" value="${escapeAttr(state.editStaffPhone || selected.phone || '')}" placeholder="${escapeAttr(selected.phone || '')}" /></label>
                        <label class="field"><span>岗位</span><input class="input" data-field="editStaffPosition" value="${escapeAttr(state.editStaffPosition || selected.position || '店员')}" /></label>
                        <div class="action-strip">
                          <button class="btn btn-primary" data-staff-update="${selected.id}" type="button">保存档案</button>
                          <button class="btn btn-ghost" data-staff-disable="${selected.id}" type="button">停用员工</button>
                        </div>
                      </form>
                      ${
                        selected.username
                          ? '<div class="empty-state compact">该员工已绑定后台账号。</div>'
                          : `<form class="form-grid member-create">
                              <h3>创建后台账号</h3>
                              <label class="field"><span>登录账号</span><input class="input" data-field="staffAccountUsername" value="${escapeAttr(state.staffAccountUsername)}" placeholder="例如：staff02" /></label>
                              <label class="field"><span>初始密码</span><input class="input" type="password" data-field="staffAccountPassword" /></label>
                              <label class="field">
                                <span>账号角色</span>
                                <select class="input" data-field="staffAccountRole">
                                  <option value="staff" ${state.staffAccountRole !== 'admin' ? 'selected' : ''}>员工</option>
                                  <option value="admin" ${state.staffAccountRole === 'admin' ? 'selected' : ''}>管理员</option>
                                </select>
                              </label>
                              <button class="btn btn-secondary full" data-staff-account="${selected.id}" type="button">创建账号</button>
                            </form>`
                      }`
                    : '<div class="empty-state compact">当前账号不是管理员，只能查看员工档案。</div>'
                }`
              : '<div class="empty-state">选择左侧员工后，可以查看工号、岗位和后台账号状态。</div>'
          }
          ${
            canAdmin
              ? `<form class="form-grid member-create">
                  <h3>新增员工</h3>
                  <label class="field"><span>员工姓名</span><input class="input" data-field="newStaffName" value="${escapeAttr(state.newStaffName)}" placeholder="例如：小周" /></label>
                  <label class="field"><span>手机号</span><input class="input" data-field="newStaffPhone" value="${escapeAttr(state.newStaffPhone)}" placeholder="例如：13800009003" /></label>
                  <label class="field"><span>岗位</span><input class="input" data-field="newStaffPosition" value="${escapeAttr(state.newStaffPosition)}" /></label>
                  <button class="btn btn-primary full" data-staff-create type="button">新增员工档案</button>
                </form>`
              : ''
          }
        </div>
      </div>
    </section>`;
}

function renderReservations() {
  const rows = pendingReservations();
  if (!rows.length) return '<div class="empty-state compact">暂无待处理预约。</div>';
  return rows
    .slice(0, 8)
    .map(
      (r) => `
        <div class="data-row">
          <div><strong>#${r.id} ${escapeHtml(r.tableCode || '')}</strong><span>${escapeHtml(reservationDisplayName(r))} · ${reservationPartySize(r)} 人 · ${escapeHtml(formatTimeRange(r.reservedStart, r.reservedEnd))}</span></div>
          <button class="btn btn-secondary btn-sm" data-checkin="${r.id}" type="button">入场</button>
        </div>`
    )
    .join('');
}

function renderSessions() {
  if (!state.openSessions.length) return '<div class="empty-state compact">暂无进行中的对局。</div>';
  return state.openSessions
    .slice(0, 8)
    .map(
      (s) => {
        const timing = sessionTiming(s);
        return `
        <div class="data-row">
          <div><strong>#${s.id} ${escapeHtml(s.tableCode)}</strong><span>${escapeHtml(sessionDisplayName(s))} · ${sessionPartySize(s)} 人 · 已进行 ${formatDurationFrom(s.startedAt)}</span></div>
          <span class="soft-chip">${escapeHtml(timing.label)}</span>
        </div>`;
      }
    )
    .join('');
}

function renderLeaderboard() {
  if (!state.leaderboard.length) return '<div class="empty-state compact">暂无排行数据。</div>';
  const sort = state.leaderboardSort === 'elo' ? 'elo' : 'winrate';
  const sorted = state.leaderboard.slice().sort((a, b) => {
    if (sort === 'elo') return (Number(b.eloRating) || 0) - (Number(a.eloRating) || 0) || b.wins - a.wins;
    return Number(b.winRate) - Number(a.winRate) || b.wins - a.wins;
  });
  const toggle = `
    <div class="lb-toggle">
      <button class="lb-toggle-btn ${sort === 'winrate' ? 'is-active' : ''}" data-lb-sort="winrate" type="button">胜率</button>
      <button class="lb-toggle-btn ${sort === 'elo' ? 'is-active' : ''}" data-lb-sort="elo" type="button">ELO</button>
    </div>`;
  const rows = sorted
    .slice(0, 6)
    .map((row, index) => {
      const tier = eloTier(row.eloRating);
      const metric = sort === 'elo'
        ? `<b>${Number(row.eloRating) || 1200}</b>`
        : `<b>${formatWinRate(row.winRate)}</b>`;
      return `
        <div class="rank-row">
          <span class="rank-no">${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.displayName)} <span class="tier-badge ${tier.cls}">${tier.name}</span></strong>
            <span>${row.wins} 胜 / ${row.losses ?? 0} 负 / ${row.games} 局 · ELO ${Number(row.eloRating) || 1200}</span>
          </div>
          ${metric}
        </div>`;
    })
    .join('');
  return toggle + rows;
}

function renderGameCatalog() {
  return state.games
    .slice(0, 6)
    .map((game) => {
      const plays = game.recentPlayCount ?? game.recent_play_count ?? game.playCount ?? 0;
      return `
        <article class="game-card">
          ${renderGameCover(game, 'dashboard-game-cover')}
          <div><strong>${escapeHtml(game.title)}</strong><span>${game.minPlayers || 2}-${game.maxPlayers || 8} 人 · 近 30 天 ${plays} 次 · 热度 ${Number(game.hotScore || 0).toFixed(0)}</span></div>
        </article>`;
    })
    .join('');
}

function renderOpsAlerts() {
  const maintenance = state.maintenance || {};
  const dueSoon = Array.isArray(maintenance.dueSoonSessions) && maintenance.dueSoonSessions.length
    ? maintenance.dueSoonSessions
    : state.openSessions
        .map((session) => ({ ...session, ...sessionTiming(session) }))
        .filter((session) => Number(session.minutesLeft) > 0 && Number(session.minutesLeft) <= 15)
        .slice(0, 4);
  const expired = Number(maintenance.expiredReservations || 0);
  const overdue = Array.isArray(maintenance.overdueSessions) && maintenance.overdueSessions.length
    ? maintenance.overdueSessions
    : state.openSessions
        .map((session) => ({ ...session, ...sessionTiming(session) }))
        .filter((session) => Number(session.minutesLeft) <= 0)
        .slice(0, 4);
  if (!expired && !overdue.length && !dueSoon.length && !maintenance.error) return '';
  const rows = [];
  if (expired) rows.push(`已自动标记 ${expired} 条超时未到预约`);
  overdue.forEach((item) => {
    const minutes = item.minutesOverdue ?? (Math.abs(Number(item.minutesLeft || 0)) || '?');
    rows.push(`${item.tableCode || item.table_code || '桌位'} · ${item.guestName || item.guest_name || '客人'} 已超时 ${minutes} 分钟，请处理续时或结算`);
  });
  if (maintenance.error) rows.push(`自动维护检查失败：${maintenance.error}`);
  dueSoon.forEach((item) => {
    const minutes = item.minutesLeft ?? item.minutes_left ?? '?';
    rows.push(`${item.tableCode || item.table_code || '桌位'} · ${item.guestName || item.guest_name || '客人'} 约 ${minutes} 分钟后结束`);
  });
  return `
    <section class="alert border border-warning/25 bg-warning/10 rounded-2xl shadow-sm">
      <div>
        <h3 class="font-bold text-sm">运营提醒</h3>
        <div class="text-sm opacity-80">${rows.map((row) => `<span class="mr-4">${escapeHtml(row)}</span>`).join('')}</div>
      </div>
    </section>`;
}

function renderAuthScreen() {
  const isRegister = ALLOW_PUBLIC_REGISTER && state.authMode === 'register';
  const tabBtn = (active, mode, label) =>
    `<button class="flex-1 min-h-9 rounded-lg font-bold text-sm transition ${active ? 'bg-white text-primary shadow' : 'text-white/70 hover:text-white'}" data-auth-mode="${mode}" type="button">${label}</button>`;
  const field = (label, attrs) =>
    `<label class="form-control w-full"><span class="label-text text-sm font-semibold mb-1">${label}</span><input class="input input-bordered w-full rounded-xl" ${attrs} /></label>`;
  return `
    <div data-theme="bgcafe" class="min-h-screen grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <section class="relative overflow-hidden hidden lg:flex items-end p-12 bg-gradient-to-br from-orange-500 via-pink-500 to-purple-700 text-white">
        <div class="absolute inset-0 opacity-20" style="background-image:radial-gradient(circle at 25% 25%, #fff 0, transparent 40%), radial-gradient(circle at 75% 60%, #fff 0, transparent 35%)"></div>
        <div class="relative">
          <span class="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">🎲 Dice Cat Ops</span>
          <h1 class="mt-4 text-5xl font-extrabold leading-tight tracking-tight">桌游门店<br/>运营工作台</h1>
          <p class="mt-4 max-w-md text-lg text-white/85">预约、桌位、会员、结算、战绩、AI 助手，全部在同一个后台完成。</p>
        </div>
      </section>
      <section class="flex items-center justify-center p-6 bg-base-200" aria-label="${isRegister ? '注册账号' : '登录账号'}">
        <div class="card w-full max-w-md bg-base-100 shadow-xl rounded-3xl border border-base-300/50">
          <div class="card-body p-8 gap-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-primary">${isRegister ? 'Create Account' : 'Staff Login'}</span>
              <h2 class="text-2xl font-bold tracking-tight mt-1">${isRegister ? '注册员工账号' : '登录后台'}</h2>
            </div>
            ${ALLOW_PUBLIC_REGISTER
              ? `<div class="flex gap-1 p-1 rounded-xl bg-gradient-to-r from-orange-500 to-purple-600">
                   ${tabBtn(!isRegister, 'login', '登录')}
                   ${tabBtn(isRegister, 'register', '注册')}
                 </div>`
              : ''}
            ${isRegister
              ? `<form class="grid gap-3">
                  ${field('账号', `data-field="registerUsername" autocomplete="username" value="${escapeAttr(state.registerUsername)}"`)}
                  ${field('显示名称', `data-field="registerDisplayName" autocomplete="name" value="${escapeAttr(state.registerDisplayName)}"`)}
                  ${field('密码', `type="password" data-field="registerPassword" autocomplete="new-password"`)}
                  <button class="btn btn-primary w-full rounded-xl border-0 bg-gradient-to-r from-orange-500 to-purple-600 text-white shadow-lg hover:opacity-90 mt-1" data-register type="button">注册并进入</button>
                </form>`
              : `<form class="grid gap-3">
                  ${field('账号', `data-field="loginUsername" autocomplete="username" value="${escapeAttr(state.loginUsername)}"`)}
                  ${field('密码', `type="password" data-field="loginPassword" autocomplete="current-password"`)}
                  <button class="btn btn-primary w-full rounded-xl border-0 bg-gradient-to-r from-orange-500 to-purple-600 text-white shadow-lg hover:opacity-90 mt-1" data-login type="button">登录</button>
                </form>`}
          </div>
        </div>
      </section>
    </div>`;
}

const navIcons = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Z"/><path d="M14 20h6V4h-6v16Z"/><path d="M4 20h6v-3H4v3Z"/></svg>',
  tables: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h14"/><path d="M7 10v8"/><path d="M17 10v8"/><path d="M8 6h8a3 3 0 0 1 3 3v1H5V9a3 3 0 0 1 3-3Z"/></svg>',
  members: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><path d="M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M17 11a2.5 2.5 0 0 0 0-5"/><path d="M21 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/></svg>',
  staff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 20a8 8 0 0 1 16 0"/><path d="M15 7h3"/><path d="M16.5 5.5v3"/></svg>',
  sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7V7Z"/><path d="M4 4h3v3H4V4Z"/><path d="M17 4h3v3h-3V4Z"/><path d="M4 17h3v3H4v-3Z"/><path d="M17 17h3v3h-3v-3Z"/></svg>',
  reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-7"/></svg>',
  games: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5V5Z"/><path d="M8.5 8.5h.01"/><path d="M15.5 8.5h.01"/><path d="M12 12h.01"/><path d="M8.5 15.5h.01"/><path d="M15.5 15.5h.01"/></svg>',
  coupons: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V8Z"/><path d="M9 9h.01"/><path d="M15 15h.01"/><path d="M15 9l-6 6"/></svg>',
  billing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4V7Z"/><path d="M4 10h16"/><path d="M8 15h3"/></svg>',
  rental: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8l7-4 7 4-7 4-7-4Z"/><path d="M5 8v8l7 4 7-4V8"/><path d="M12 12v8"/></svg>',
  'staff-mgmt': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M18 8l1.5 1.5L22 7"/></svg>',
  ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v2"/><path d="M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M9 16h6"/></svg>',
};

function renderNavIcon(id) {
  return navIcons[id] || '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
}

function renderNav() {
  const collapsed = state.sidebarCollapsed;
  return visibleNavItems
    .map((item) => {
      const active = state.activePage === item.id;
      return `
        <a href="#/${item.id}" data-page="${item.id}" ${active ? 'aria-current="page"' : ''}
          title="${escapeAttr(item.label)}"
          class="admin-nav-link ${active ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''}">
          <span class="admin-nav-icon">${renderNavIcon(item.id)}</span>
          ${collapsed ? '' : `<span class="admin-nav-label">${escapeHtml(item.label)}</span>`}
        </a>`;
    })
    .join('');
}

function renderMobileNav() {
  if (!state.mobileNavOpen) return '';
  return `
    <div class="lg:hidden fixed inset-0 z-40">
      <button class="absolute inset-0 bg-black/35 backdrop-blur-[2px]" data-mobile-nav-close type="button" aria-label="关闭菜单"></button>
      <aside class="absolute left-0 top-0 h-full w-[82vw] max-w-[320px] bg-base-100 shadow-2xl border-r border-base-300 flex flex-col">
        <div class="flex items-center justify-between px-4 py-4 border-b border-base-300">
          <div class="flex items-center gap-3 min-w-0">
            <span class="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-purple-600 text-xl shadow-lg">🎲</span>
            <div class="min-w-0">
              <div class="text-xs font-bold uppercase tracking-wider text-base-content/40">后台菜单</div>
              <strong class="block truncate">${escapeHtml(state.venue?.name || '桌游门店')}</strong>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm btn-circle" data-mobile-nav-close type="button" aria-label="关闭菜单">×</button>
        </div>
        <nav class="grid gap-1 p-3 overflow-y-auto" aria-label="移动端后台导航">
          ${visibleNavItems.map((item) => {
            const active = state.activePage === item.id;
            return `
              <a href="#/${item.id}" data-page="${item.id}" ${active ? 'aria-current="page"' : ''}
                class="mobile-nav-link ${active ? 'is-active' : ''}">
                <span class="mobile-nav-icon">${renderNavIcon(item.id)}</span>
                <span class="truncate">${escapeHtml(item.label)}</span>
              </a>`;
          }).join('')}
        </nav>
        <div class="mt-auto p-3 border-t border-base-300 text-xs text-base-content/45">
          当前账号：${escapeHtml(state.currentUser?.displayName || state.currentUser?.username || '后台用户')}
        </div>
      </aside>
    </div>`;
}

function renderAiCommandCenter(summary) {
  const fallbackCards = [
    { id: 'tables', label: '空闲桌位', value: String(summary.idle || 0), tone: 'green', detail: `${summary.occupied || 0} 张占用` },
    { id: 'reservations', label: '待处理预约', value: String(summary.pending || 0), tone: 'amber', detail: '需要店员确认到店' },
    { id: 'sessions', label: '进行中对局', value: String(summary.open || 0), tone: 'cyan', detail: '关注临近结束对局' },
    { id: 'members', label: '会员数量', value: String(summary.members || 0), tone: 'violet', detail: '可做复购运营' },
  ];
  const cards = state.aiCards?.length ? state.aiCards : fallbackCards;
  const actions = state.aiActions?.length
    ? state.aiActions
    : [{ label: '当前数据稳定，建议主推热门桌游和会员活动', severity: 'info', page: 'dashboard' }];
  const risks = state.aiSnapshot?.risks || [];
  const tools = state.aiToolResults || [];
  const topGames = state.aiSnapshot?.topGames || state.popularity.slice(0, 4).map((row) => ({
    title: row.title || row.game_title || '热门桌游',
    playCount: row.record_count ?? row.play_count ?? 0,
  }));
  const toneClass = (tone) => `neon-kpi--${['cyan', 'green', 'amber', 'rose', 'violet'].includes(tone) ? tone : 'cyan'}`;
  const toolCount = tools.length || 5;
  const flowNodes = [
    {
      key: 'input',
      step: '01',
      label: '数据接入',
      detail: `${state.tables.length || 0} 张桌位 · ${state.reservations.length || 0} 条预约`,
      meta: '桌位 / 会员 / 租借 / 收入',
    },
    {
      key: 'tools',
      step: '02',
      label: '工具检索',
      detail: `${toolCount} 个确定性工具先查数据库`,
      meta: tools[0]?.step || tools[0]?.tool || '空桌、热度、风险队列',
    },
    {
      key: 'reason',
      step: '03',
      label: '神经推理',
      detail: '融合经营信号，生成上下文判断',
      meta: 'LLM 只读数据，不直接改业务',
    },
    {
      key: 'risk',
      step: '04',
      label: '风险研判',
      detail: `${risks.length || 0} 个待关注运营信号`,
      meta: risks[0]?.title || '超时、空桌、租借、活跃度',
    },
    {
      key: 'action',
      step: '05',
      label: '建议动作',
      detail: `${actions.length} 条可执行运营建议`,
      meta: actions[0]?.label || '由店长或员工确认执行',
    },
  ];
  const neuralMesh = `
    <div class="neural-mesh" aria-hidden="true">
      <svg viewBox="0 0 220 104" role="img" focusable="false">
        <path class="neural-path neural-path--a" d="M20 22 C70 12, 92 38, 132 30 S178 18, 202 28" />
        <path class="neural-path neural-path--b" d="M20 52 C62 48, 92 76, 132 58 S174 42, 202 72" />
        <path class="neural-path neural-path--c" d="M20 82 C66 70, 92 24, 132 44 S176 84, 202 50" />
      </svg>
      <span style="--x:8%;--y:18%;--d:0s"></span>
      <span style="--x:27%;--y:46%;--d:.18s"></span>
      <span style="--x:46%;--y:28%;--d:.36s"></span>
      <span style="--x:46%;--y:68%;--d:.52s"></span>
      <span style="--x:66%;--y:42%;--d:.7s"></span>
      <span style="--x:88%;--y:58%;--d:.9s"></span>
    </div>`;

  return `
    <section class="ai-command-shell">
      <div class="ai-command-hero">
        <div class="ai-command-copy">
          <div class="neon-eyebrow">AI OPERATION CORE</div>
          <h2>AI 经营大脑</h2>
          <p>系统先读取桌位、预约、会员、租借和收入数据，再由大模型生成经营建议；所有写操作仍由店员确认。</p>
        </div>
        <div class="ai-orbit" aria-hidden="true">
          <span></span><span></span><span></span>
          <strong>AI</strong>
        </div>
      </div>
      <div class="ai-flow" aria-label="AI 经营大脑横向推理流程">
        ${flowNodes.map((node, index) => `
          <article class="ai-flow-node ai-flow-node--${escapeAttr(node.key)}" style="--i:${index}">
            <div class="ai-flow-head">
              <span>${escapeHtml(node.step)}</span>
              <strong>${escapeHtml(node.label)}</strong>
            </div>
            <p>${escapeHtml(node.detail)}</p>
            <small>${escapeHtml(node.meta)}</small>
            ${node.key === 'reason' ? neuralMesh : ''}
          </article>`).join('')}
      </div>
      <div class="neon-kpi-grid">
        ${cards.map((card) => `
          <article class="neon-kpi ${toneClass(card.tone)}">
            <span>${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <small>${escapeHtml(card.detail || '')}</small>
          </article>`).join('')}
      </div>
      <div class="ai-command-panels">
        <article class="neon-panel">
          <div class="neon-panel-head"><span>风险雷达</span><b>${risks.length || 0}</b></div>
          ${(risks.length ? risks : [{ title: '暂无高风险', detail: '可以重点做推荐和会员转化。', level: 'info', count: 0 }]).slice(0, 4).map((risk) => `
            <div class="neon-risk neon-risk--${escapeAttr(risk.level || 'info')}">
              <strong>${escapeHtml(risk.title)}</strong>
              <span>${escapeHtml(risk.detail || '')}</span>
              ${risk.count ? `<b>${risk.count}</b>` : ''}
            </div>`).join('')}
        </article>
        <article class="neon-panel">
          <div class="neon-panel-head"><span>AI 建议动作</span><b>${actions.length}</b></div>
          ${actions.slice(0, 5).map((action) => `
            <button class="neon-action" type="button" data-page="${escapeAttr(action.page || 'dashboard')}">
              <span>${escapeHtml(action.label)}</span>
              <small>${escapeHtml(action.severity || 'info')}</small>
            </button>`).join('')}
        </article>
        <article class="neon-panel">
          <div class="neon-panel-head"><span>热门桌游信号</span><b>${topGames.length}</b></div>
          ${topGames.slice(0, 5).map((game, index) => `
            <div class="neon-rank">
              <span>${index + 1}</span>
              <strong>${escapeHtml(game.title || '热门桌游')}</strong>
              <small>${Number(game.playCount || 0)} 局</small>
            </div>`).join('') || '<div class="neon-empty">暂无热度数据</div>'}
        </article>
      </div>
    </section>`;
}

function renderDashboardPage(summary) {
  const pendingCount = pendingReservations().length;
  const card = (title, badge, body) => `
    <div class="card bg-base-100 shadow-md border border-base-200 rounded-2xl">
      <div class="card-body p-5">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title text-base font-bold">${title}</h2>
          <span class="badge badge-ghost badge-sm">${badge}</span>
        </div>
        ${body}
      </div>
    </div>`;
  return `
    <div class="dash-fresh dashboard-neon space-y-5 pt-2">
      ${renderAiCommandCenter(summary)}
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="关键指标">${renderMetricCards(summary)}</section>
      ${renderOpsAlerts()}
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        ${card('待处理预约', `${pendingCount} 条`, renderReservations())}
        ${card('进行中对局', `${state.openSessions.length} 局`, renderSessions())}
        ${card('会员排行', '胜率', renderLeaderboard())}
      </section>
      ${card('桌游目录热度', '封面 / 人数 / 近 30 天', `<div class="game-grid mt-1">${renderGameCatalog()}</div>`)}
    </div>`;
}

function renderTablesPage() {
  return `
    <section class="workspace page-section">
      <div class="panel panel-floor" id="floor">${renderFloor()}</div>
      <aside class="panel operations" id="workflow">${renderSelectedPanel()}</aside>
    </section>`;
}

function renderMembersPage() {
  return renderMembers();
}

function renderStaffManagementPage() {
  return renderStaffPage();
}

function renderSessionsPage() {
  const pendingCount = pendingReservations().length;
  const card = (title, badge, body) => `
    <div class="card bg-base-100 shadow-md border border-base-200 rounded-2xl">
      <div class="card-body p-5">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title text-base font-bold">${title}</h2>
          <span class="badge badge-ghost badge-sm">${badge}</span>
        </div>
        ${body}
      </div>
    </div>`;
  return `
    <div class="space-y-5 pt-2">
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        ${card('待处理预约', `${pendingCount} 条`, renderReservations())}
        ${card('进行中对局', `${state.openSessions.length} 局`, renderSessions())}
        ${card('会员排行', '胜率', renderLeaderboard())}
      </section>
      ${card('桌游目录热度', '近 30 天', `<div class="game-grid mt-1">${renderGameCatalog()}</div>`)}
    </div>`;
}

function renderReportsPage() {
  const settled = state.revenue?.settled_sessions ?? state.revenue?.settledSessions ?? 0;
  const minutes = state.revenue?.total_billed_minutes ?? state.revenue?.totalBilledMinutes ?? 0;
  const popularityRows = state.popularity
    .slice(0, 8)
    .map((row, index) => {
      const plays = row.record_count ?? row.play_count ?? row.plays ?? 0;
      return `<div class="report-row"><span>${index + 1}</span><strong>${escapeHtml(row.title || row.game_title || '未知游戏')}</strong><b>${plays} 局</b></div>`;
    })
    .join('');
  const tableRows = state.tableUtilization
    .slice(0, 8)
    .map((row, index) => {
      const sessions = row.settled_sessions_in_range ?? row.settledSessionsInRange ?? row.sessions ?? 0;
      return `<div class="report-row"><span>${index + 1}</span><strong>${escapeHtml(row.code || row.tableCode || '未知桌位')}</strong><b>${sessions} 次</b></div>`;
    })
    .join('');

  const kpi = (label, value, hint, grad, icon) => `
    <section class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-lg transition-transform hover:-translate-y-1">
      <span class="absolute -right-2 -top-2 text-6xl opacity-20">${icon}</span>
      <span class="block text-sm font-medium opacity-90">${label}</span>
      <strong class="my-1 block text-4xl font-extrabold leading-none tracking-tight">${value}</strong>
      <span class="block text-xs opacity-80">${hint}</span>
    </section>`;
  const activeTables = state.tableUtilization.filter((row) => Number(row.settled_sessions_in_range ?? row.settledSessionsInRange ?? 0) > 0).length;
  const panel = (title, sub, body) => `
    <div class="card bg-base-100 shadow-md rounded-2xl border border-base-200">
      <div class="card-body p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-bold m-0">${title}</h2>
          <span class="text-xs text-base-content/50">${sub}</span>
        </div>
        ${body}
      </div>
    </div>`;
  return `
    <div class="space-y-5 pt-2">
      <section class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${kpi('今日收入', `¥${moneyFromRevenue()}`, `已结算 ${settled} 单`, 'from-orange-400 to-pink-500', '💰')}
        ${kpi('计费时长', `${Number(minutes || 0)}`, '分钟', 'from-violet-400 to-purple-600', '⏱️')}
        ${kpi('活跃桌位', `${activeTables}`, '近 30 天有结算记录', 'from-sky-400 to-indigo-500', '🪑')}
      </section>
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        ${panel('桌游热度排行', '近 30 天战绩记录', `<div class="report-list">${popularityRows || '<div class="empty-state compact">暂无热度数据。</div>'}</div>`)}
        ${panel('桌位利用率', '近 30 天已结算对局', `<div class="report-list">${tableRows || '<div class="empty-state compact">暂无桌位利用率数据。</div>'}</div>`)}
      </section>
    </div>`;
}

function gameCoverUrl(game) {
  return String(game?.cover_image_url || game?.coverImageUrl || '').trim();
}

function renderGameCover(game, className) {
  const url = gameCoverUrl(game);
  if (url) {
    return `<img class="${escapeAttr(className)}" src="${escapeAttr(url)}" alt="${escapeAttr(`${game.title || '桌游'}封面`)}" loading="lazy" />`;
  }
  return `<div class="${escapeAttr(className)} game-cover-placeholder" role="img" aria-label="${escapeAttr(`${game.title || '桌游'}暂无封面`)}"><span>${escapeHtml(game.title || '暂无封面')}</span></div>`;
}

function customerDifficulty(game) {
  const diffLabels = { 1: '入门', 2: '简单', 3: '中等', 4: '较难', 5: '重度' };
  return diffLabels[Number(game.difficultyLevel || game.difficulty_level || game.difficulty || 3)] || '中等';
}

function renderCustomerLeaderboardPanel() {
  const rows = (state.leaderboard || [])
    .slice()
    .sort((a, b) => (Number(b.eloRating) || 0) - (Number(a.eloRating) || 0) || Number(b.winRate) - Number(a.winRate))
    .slice(0, 5);
  return `
    <section class="card bg-base-100 rounded-3xl border border-base-300/60 shadow-md">
      <div class="card-body p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="m-0 text-lg font-bold tracking-tight">玩家排行榜</h3>
          <span class="text-xs font-semibold text-base-content/45">ELO TOP 5</span>
        </div>
        <div class="mt-4 grid gap-2">
          ${rows.length ? rows.map((row, index) => {
            const tier = eloTier(row.eloRating);
            return `
              <div class="flex items-center gap-3 rounded-2xl bg-base-200/70 px-3 py-2">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-black text-primary">${index + 1}</span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-bold">${escapeHtml(row.displayName)} <span class="tier-badge ${tier.cls}">${tier.name}</span></div>
                  <div class="text-xs text-base-content/55">${row.wins || 0} 胜 / ${row.games || 0} 局 · 胜率 ${formatWinRate(row.winRate)}</div>
                </div>
                <b class="tabular-nums text-primary">${Number(row.eloRating) || 1200}</b>
              </div>`;
          }).join('') : '<div class="rounded-2xl bg-base-200/70 p-4 text-sm text-base-content/55">暂无排行数据，完成对局记录后会自动生成。</div>'}
        </div>
      </div>
    </section>`;
}

function renderCustomerRentalPanel() {
  const rentals = state.publicRentalGames || [];
  return `
    <section class="card bg-base-100 rounded-3xl border border-base-300/60 shadow-md">
      <div class="card-body p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="m-0 text-lg font-bold tracking-tight">桌游租借</h3>
          <span class="text-xs font-semibold text-base-content/45">${rentals.length ? `${rentals.length} 款可借` : '到店咨询'}</span>
        </div>
        <div class="mt-4 grid gap-3">
          ${rentals.length ? rentals.slice(0, 4).map((game) => `
            <article class="flex gap-3 rounded-2xl bg-base-200/70 p-3">
              ${renderGameCover(game, 'h-16 w-16 shrink-0 rounded-2xl object-cover')}
              <div class="min-w-0 flex-1">
                <div class="truncate font-bold">${escapeHtml(game.title)}</div>
                <div class="mt-1 text-xs text-base-content/55">${game.minPlayers || 2}-${game.maxPlayers || 6}人 · ${game.avgMinutes || 90}分钟 · ${game.availableCopies || 0} 套可借</div>
                <div class="mt-1 text-xs text-base-content/55">押金 ¥${((Number(game.depositCents) || 0) / 100).toFixed(0)}${game.locations ? ` · ${escapeHtml(game.locations)}` : ''}</div>
              </div>
            </article>`).join('') : '<div class="rounded-2xl bg-base-200/70 p-4 text-sm leading-6 text-base-content/60">后台登记桌游副本后，这里会自动展示可借清单。顾客可在到店时向店员确认押金和归还时间。</div>'}
        </div>
      </div>
    </section>`;
}

function renderCustomerGameCatalog(games) {
  if (!games.length) {
    return '<div class="customer-empty-state">暂无公开桌游。请在后台“桌游目录”添加或检查生产数据库数据。</div>';
  }
  const expanded = Boolean(state.customerCatalogExpanded);
  const visibleGames = expanded ? games : games.slice(0, 6);
  return `
    <div class="customer-catalog-stack">
      <div class="customer-game-grid">
        ${visibleGames.map((g) => `
          <article class="customer-game-card">
            <figure class="customer-game-cover">
              ${renderGameCover(g, 'w-full h-full object-cover')}
            </figure>
            <div class="customer-game-body">
              <div class="customer-game-title-row">
                <h4>${escapeHtml(g.title)}</h4>
                <span>${Number(g.hotScore || 0).toFixed(0)}</span>
              </div>
              <div class="customer-game-meta">
                <span>${g.min_players || g.minPlayers || 2}-${g.max_players || g.maxPlayers || 6}人</span>
                <span>${g.avg_minutes || g.avgMinutes || 90}分钟</span>
                <span>${customerDifficulty(g)}</span>
              </div>
              <p class="customer-game-stats">近30天 ${g.recentPlayCount || 0} 次 · 总计 ${g.playCount || 0} 次</p>
              ${g.description ? `<p class="customer-game-desc line-clamp-3">${escapeHtml(g.description)}</p>` : ''}
            </div>
          </article>`).join('')}
      </div>
      ${games.length > 6 ? `
        <button class="btn btn-outline btn-primary w-full rounded-2xl customer-catalog-toggle" data-customer-catalog-toggle type="button">
          ${expanded ? '收起桌游目录' : `展开全部 ${games.length} 款桌游`}
        </button>
      ` : ''}
    </div>`;
}

function renderCustomerAccountPanel() {
  if (state.customerPlayer) {
    return `
      <section id="customer-account" class="card bg-base-100 shadow-lg rounded-3xl border border-base-300/60">
        <div class="card-body p-5 gap-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-bold uppercase tracking-wider text-base-content/40">我的账号</div>
              <h3 class="m-0 text-xl font-extrabold truncate">${escapeHtml(state.customerPlayer.displayName || '玩家')}</h3>
            </div>
            <button class="btn btn-ghost btn-sm rounded-full" data-customer-logout type="button">退出</button>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-2xl bg-base-200 p-3"><div class="text-base-content/45">手机号</div><strong>${escapeHtml(state.customerPlayer.phone || '未填写')}</strong></div>
            <div class="rounded-2xl bg-base-200 p-3"><div class="text-base-content/45">会员号</div><strong>${escapeHtml(state.customerPlayer.memberNo || '自动生成')}</strong></div>
          </div>
        </div>
      </section>`;
  }

  const isRegister = state.customerAuthMode === 'register';
  return `
    <section id="customer-account" class="card bg-base-100 shadow-lg rounded-3xl border border-base-300/60">
      <div class="card-body p-5 gap-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold uppercase tracking-wider text-base-content/40">玩家账号</div>
            <h3 class="m-0 text-xl font-extrabold">${isRegister ? '创建账号' : '登录后预约'}</h3>
          </div>
          <div class="join">
            <button class="join-item btn btn-xs ${!isRegister ? 'btn-primary' : 'btn-ghost'}" data-customer-auth-mode="login" type="button">登录</button>
            <button class="join-item btn btn-xs ${isRegister ? 'btn-primary' : 'btn-ghost'}" data-customer-auth-mode="register" type="button">注册</button>
          </div>
        </div>
        ${isRegister ? `
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">昵称</span>
            <input class="input input-bordered w-full rounded-xl" data-field="customerRegisterName" value="${escapeAttr(state.customerRegisterName)}" placeholder="例如：小林" />
          </label>
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">手机号</span>
            <input class="input input-bordered w-full rounded-xl" type="tel" data-field="customerRegisterPhone" value="${escapeAttr(state.customerRegisterPhone)}" />
          </label>
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">密码</span>
            <input class="input input-bordered w-full rounded-xl" type="password" data-field="customerRegisterPassword" autocomplete="new-password" />
          </label>
          <button class="btn btn-primary w-full rounded-xl" data-customer-register type="button">注册并登录</button>
        ` : `
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">手机号</span>
            <input class="input input-bordered w-full rounded-xl" type="tel" data-field="customerLoginPhone" value="${escapeAttr(state.customerLoginPhone)}" />
          </label>
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">密码</span>
            <input class="input input-bordered w-full rounded-xl" type="password" data-field="customerLoginPassword" autocomplete="current-password" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button class="btn btn-primary rounded-xl" data-customer-login type="button">登录</button>
            <button class="btn btn-outline btn-primary rounded-xl" data-customer-auth-mode="register" type="button">注册玩家账号</button>
          </div>
        `}
        <p class="m-0 text-xs text-base-content/45">登录后提交的预约会自动进入“我的预约”。</p>
      </div>
    </section>`;
}

function renderCustomerReservationsPanel() {
  if (!state.customerPlayer) {
    return `
      <section class="card bg-base-100 shadow-md rounded-3xl border border-base-300/60">
        <div class="card-body p-5">
          <h3 class="m-0 text-xl font-extrabold">我的预约</h3>
          <p class="m-0 text-sm text-base-content/55">登录玩家账号后，可以查看自己的预约记录并在入场后提交战绩。</p>
        </div>
      </section>`;
  }
  if (state.customerReservationsLoading) {
    return `
      <section class="card bg-base-100 shadow-md rounded-3xl border border-base-300/60">
        <div class="card-body p-5"><span class="loading loading-dots loading-md"></span></div>
      </section>`;
  }
  const rows = state.customerReservations || [];
  return `
    <section class="card bg-base-100 shadow-md rounded-3xl border border-base-300/60">
      <div class="card-body p-5 gap-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="m-0 text-xl font-extrabold">我的预约</h3>
          <span class="badge badge-ghost rounded-full">${rows.length} 条</span>
        </div>
        ${rows.length ? `
          <div class="grid gap-3">
            ${rows.slice(0, 8).map((reservation) => {
              const hasSession = Boolean(reservation.sessionId);
              const hasRecord = Number(reservation.recordCount || 0) > 0;
              return `
                <article class="rounded-2xl border border-base-300/70 bg-base-200/55 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <strong class="text-base">${escapeHtml(reservation.tableCode || '待分配桌位')}</strong>
                        <span class="badge badge-sm rounded-full">${escapeHtml(reservationStatusText(reservation.status))}</span>
                      </div>
                      <div class="mt-1 text-sm text-base-content/60">${escapeHtml(formatTimeRange(reservation.reservedStart, reservation.reservedEnd))}</div>
                      <div class="mt-1 text-xs text-base-content/45">${reservation.partySize || 1} 人 · 预约 #${reservation.id}</div>
                    </div>
                    <div class="shrink-0">
                      ${hasRecord
                        ? '<span class="badge badge-success rounded-full">战绩已提交</span>'
                        : hasSession
                          ? `<button class="btn btn-sm btn-primary rounded-full" data-customer-record="${reservation.id}" type="button">填写战绩</button>`
                          : '<span class="badge badge-ghost rounded-full">入场后可填战绩</span>'}
                    </div>
                  </div>
                </article>`;
            }).join('')}
          </div>
        ` : '<div class="rounded-2xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/50">还没有预约记录。</div>'}
      </div>
    </section>`;
}

function customerRecordReservation() {
  return (state.customerReservations || []).find((item) => Number(item.id) === Number(state.customerRecordReservationId)) || null;
}

function renderCustomerRecordModal() {
  const reservation = customerRecordReservation();
  if (!reservation) return '';
  const games = state.games || [];
  const gameOptions = games.map((game) => `<option value="${game.id}" ${String(state.customerRecordGameId) === String(game.id) ? 'selected' : ''}>${escapeHtml(game.title)}</option>`).join('');
  return `
    <div class="modal modal-open">
      <div class="modal-box rounded-3xl max-w-lg">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="font-extrabold text-2xl m-0">填写战绩</h3>
            <p class="m-0 mt-1 text-sm text-base-content/55">${escapeHtml(reservation.tableCode || '')} · ${escapeHtml(formatTimeRange(reservation.reservedStart, reservation.reservedEnd))}</p>
          </div>
          <button class="btn btn-ghost btn-sm btn-circle" data-customer-record-close type="button">×</button>
        </div>
        <div class="mt-5 grid gap-4">
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">本局桌游</span>
            <select class="select select-bordered w-full rounded-xl" data-field="customerRecordGameId">
              <option value="">选择桌游</option>
              ${gameOptions}
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">胜负结果</span>
            <select class="select select-bordered w-full rounded-xl" data-field="customerRecordWinnerMode">
              <option value="self" ${state.customerRecordWinnerMode === 'self' ? 'selected' : ''}>我赢了</option>
              <option value="other" ${state.customerRecordWinnerMode === 'other' ? 'selected' : ''}>其他玩家赢了</option>
              <option value="none" ${state.customerRecordWinnerMode === 'none' ? 'selected' : ''}>无胜者 / 合作通关</option>
            </select>
          </label>
          ${state.customerRecordWinnerMode === 'other' ? `
            <label class="form-control w-full">
              <span class="label-text text-sm font-semibold mb-1">胜者昵称</span>
              <input class="input input-bordered w-full rounded-xl" data-field="customerRecordWinnerName" value="${escapeAttr(state.customerRecordWinnerName)}" />
            </label>
          ` : ''}
          <label class="form-control w-full">
            <span class="label-text text-sm font-semibold mb-1">比分 / 备注</span>
            <textarea class="textarea textarea-bordered min-h-24 rounded-xl" data-field="customerRecordScore" placeholder="可选，例如：我 83 分，阿杰 76 分">${escapeHtml(state.customerRecordScore)}</textarea>
          </label>
        </div>
        <div class="modal-action">
          <button class="btn btn-ghost rounded-xl" data-customer-record-close type="button">取消</button>
          <button class="btn btn-primary rounded-xl" data-customer-record-submit type="button" ${games.length ? '' : 'disabled'}>提交战绩</button>
        </div>
      </div>
      <div class="modal-backdrop" data-customer-record-close></div>
    </div>`;
}

function renderCustomerGuideHighlights() {
  const games = state.customerGuideGames || [];
  const tables = state.customerGuideTables || [];
  if (!games.length && !tables.length) return '';
  return `
    <section class="ai-guide-summary">
      <div>
        <span class="neon-eyebrow">AI RECOMMENDATION</span>
        <h3>AI 导购摘要</h3>
        <p>根据你刚才的问题，系统已查询店内桌游和当前空桌。预约仍需要你在左侧表单确认后提交。</p>
      </div>
      <div class="neon-guide-lists">
        <div>
          <strong>推荐桌游</strong>
          ${games.slice(0, 3).map((game) => `<span>${escapeHtml(game.title)} · ${escapeHtml(game.reason || game.category || '')}</span>`).join('') || '<span>暂无匹配桌游</span>'}
        </div>
        <div>
          <strong>当前空桌</strong>
          ${tables.slice(0, 4).map((table) => `<span>${escapeHtml(table.code)} · ${table.seatCapacity || ''}人桌</span>`).join('') || '<span>暂无直接匹配空桌</span>'}
        </div>
      </div>
    </section>`;
}

function renderCustomerBookingPage() {
  const selectedTable = state.customerMatches.find((table) => Number(table.tableId) === Number(state.customerSelectedTableId));
  const games = state.games || [];
  const leaderboardCount = (state.leaderboard || []).length;
  const rentalCount = (state.publicRentalGames || []).length;

  return `
    <section class="customer-neon-hero customer-hero-v2 relative overflow-hidden text-white">
      <div class="customer-hero-glow" aria-hidden="true"></div>
      <div class="customer-hero-shell">
        <div class="min-w-0">
          <div class="neon-eyebrow">BOARDGAME NIGHT OPS</div>
          <h2>预约开局</h2>
          <p>选好人数和时间，系统匹配桌位；右侧可以先看榜单、租借和店内桌游目录。</p>
        </div>
        <div class="customer-hero-stats">
          <span><b>${games.length}</b>款桌游</span>
          <span><b>${leaderboardCount}</b>位上榜玩家</span>
          <span><b>${rentalCount}</b>款可借</span>
        </div>
      </div>
    </section>

    <div class="customer-studio">
      <div class="customer-studio-grid">
        <aside class="customer-reservation-rail">
          <div class="customer-rail-intro">
            <span>01</span>
            <div>
              <h3>预约信息</h3>
              <p>填写到店时间后先查空桌，再确认提交。</p>
            </div>
          </div>
          <section class="customer-panel customer-booking-panel">
            <div class="customer-panel-head">
              <div>
                <span class="customer-panel-kicker">${state.customerResult ? 'RESERVED' : 'BOOKING'}</span>
                <h3>${state.customerResult ? '预约成功' : '选择时间与桌位'}</h3>
              </div>
            </div>
            ${state.customerResult
              ? `<div class="alert alert-success rounded-2xl">
                  <div>
                    <div class="font-bold">预约已提交 #${state.customerResult.reservationId}</div>
                    <div class="text-sm opacity-90">${escapeHtml(state.customerResult.tableCode || '')} ${state.customerResult.seatCapacity || ''}人桌，请按时到店。</div>
                  </div>
                </div>`
              : ''}
            <div class="customer-form-grid">
              <label class="form-control w-full">
                <span class="label-text text-sm font-semibold mb-1">姓名</span>
                <input class="input input-bordered w-full rounded-xl" data-field="customerGuestName" value="${escapeAttr(state.customerGuestName)}" placeholder="您的称呼" />
              </label>
              <label class="form-control w-full">
                <span class="label-text text-sm font-semibold mb-1">电话</span>
                <input class="input input-bordered w-full rounded-xl" type="tel" data-field="customerPhone" value="${escapeAttr(state.customerPhone)}" placeholder="方便联系" />
              </label>
              <label class="form-control w-full customer-party-field">
                <span class="label-text text-sm font-semibold mb-1">人数</span>
                <input class="input input-bordered w-full rounded-xl" type="number" min="1" max="20" data-field="customerPartySize" value="${escapeAttr(state.customerPartySize)}" />
              </label>
              <label class="form-control min-w-0">
                <span class="label-text text-sm font-semibold mb-1">到店时间</span>
                <input class="input input-bordered w-full rounded-xl customer-date-input" type="datetime-local" data-field="customerStartAt" value="${escapeAttr(state.customerStartAt)}" />
              </label>
              <label class="form-control min-w-0">
                <span class="label-text text-sm font-semibold mb-1">离店时间</span>
                <input class="input input-bordered w-full rounded-xl customer-date-input" type="datetime-local" data-field="customerEndAt" value="${escapeAttr(state.customerEndAt)}" />
              </label>
            </div>
            ${!state.customerResult ? `
              <button class="btn btn-outline btn-primary w-full rounded-2xl customer-match-button" data-customer-match type="button">查找可用桌位</button>
              ${state.customerMatches.length > 0 ? `
                <div class="customer-table-matches">
                  <div class="customer-match-title">${state.customerMatches.length} 个可用桌位</div>
                  <div class="customer-table-grid">
                    ${state.customerMatches.map((t) => {
                      const active = Number(t.tableId) === Number(state.customerSelectedTableId);
                      return `<button data-customer-table="${t.tableId}" type="button" class="customer-table-option ${active ? 'is-active' : ''}">
                        <strong>${escapeHtml(t.code)}</strong>
                        <span>${t.seatCapacity}人桌 · ${escapeHtml(t.areaType || 'standard')}</span>
                      </button>`;
                    }).join('')}
                  </div>
                  <button class="btn btn-primary w-full rounded-2xl border-0 bg-gradient-to-r from-orange-500 to-purple-600 text-white shadow-lg hover:opacity-90" data-customer-submit type="button">
                    ${selectedTable ? `预约 ${escapeHtml(selectedTable.code)}` : '自动分配并预约'}
                  </button>
                </div>
              ` : ''}
            ` : ''}
          </section>
          ${renderCustomerAccountPanel()}
        </aside>

        <main class="customer-discovery">
          <section class="customer-panel customer-discovery-hero">
            <div>
              <span class="customer-panel-kicker">DISCOVER</span>
              <h3>先选玩法，再定桌位</h3>
              <p>右侧内容都来自后台数据：热门玩家、可租借副本和店内桌游目录会随数据自动更新。</p>
            </div>
            <div class="customer-discovery-metrics">
              <span><b>${games.length}</b>桌游</span>
              <span><b>${rentalCount}</b>可借</span>
              <span><b>${leaderboardCount}</b>玩家</span>
            </div>
          </section>
          ${renderCustomerGuideHighlights()}
          ${renderCustomerReservationsPanel()}
          <section class="customer-side-grid">
            ${renderCustomerLeaderboardPanel()}
            ${renderCustomerRentalPanel()}
          </section>
          <section class="customer-catalog-section">
            <div class="customer-section-head">
              <div>
                <span class="customer-panel-kicker">CATALOG</span>
                <h3>桌游目录</h3>
                <p>不知道玩什么，或想看当前空桌，可以问右下角 AI 导购助手。</p>
              </div>
              <span>${games.length} 款</span>
            </div>
            ${renderCustomerGameCatalog(games)}
          </section>
        </main>
      </div>
    </div>`;
}

function renderPublicCustomerShell() {
  return `
    <div data-theme="bgcafe" class="min-h-screen bg-base-200 text-base-content">
      <header class="sticky top-0 z-40 flex items-center justify-between gap-4 px-5 sm:px-8 py-3 bg-base-100/80 backdrop-blur-xl border-b border-base-300/60">
        <h1 class="m-0 text-lg font-extrabold tracking-tight">
          <span class="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">🎲 ${escapeHtml(state.venue?.name || '骰子猫桌游馆')}</span>
        </h1>
        <div class="flex items-center gap-2">
          ${state.customerPlayer
            ? `<span class="hidden sm:inline text-sm text-base-content/60">${escapeHtml(state.customerPlayer.displayName || '玩家')}</span>`
            : `<button class="btn btn-sm btn-ghost rounded-full" data-customer-auth-mode="login" data-customer-auth-scroll type="button">登录</button>
               <button class="btn btn-sm btn-primary rounded-full" data-customer-auth-mode="register" data-customer-auth-scroll type="button">注册账号</button>`}
          ${state.currentUser ? `<a class="btn btn-sm btn-ghost rounded-full" href="/admin#/dashboard" data-page="dashboard">进入后台 →</a>` : ''}
        </div>
      </header>
      ${state.err ? `<div class="customer-service-notice">${escapeHtml(state.err)}</div>` : ''}
      ${renderCustomerBookingPage()}
    </div>
    ${renderCustomerRecordModal()}
    ${renderCustomerChatWidget()}`;
}

// 顾客 AI 导购气泡
function renderCustomerChatWidget() {
  const open = state.custChatOpen;
  const messages = state.custChatMessages || [];
  const bubbles = messages.length
    ? messages.map((m) => {
        const sources = Array.isArray(m.sources) && m.sources.length
          ? `<div class="ai-sources"><span class="ai-sources__label">📚 知识库依据</span>${m.sources.map((s) => `<span class="ai-source-chip">${escapeHtml(s.title)}</span>`).join('')}</div>`
          : '';
        return `<div class="ai-msg ai-msg--${m.role}"><div class="ai-bubble">${escapeHtml(m.content)}</div>${sources}</div>`;
      }).join('')
    : '<div class="cust-chat-hello">你好，我是 AI 导购助手。可以问我桌游怎么玩、规则、推荐，也能查当前空桌；预约需要你在页面表单里亲自提交。</div>';
  return `
    <div class="cust-chat ${open ? 'is-open' : ''}">
      ${open ? `
        <div class="cust-chat-window">
          <div class="cust-chat-head"><strong>AI 导购助手</strong><button class="cust-chat-close" id="btn-cust-chat-close" type="button">×</button></div>
          <div class="cust-chat-log" id="cust-chat-log">
            ${bubbles}
            ${state.custChatLoading ? '<div class="ai-msg ai-msg--assistant"><div class="ai-bubble ai-typing"><span class="loading loading-dots loading-sm"></span> 输入中</div></div>' : ''}
          </div>
          <div class="cust-chat-input">
            <input class="input" id="cust-chat-input" data-field="custChatInput" placeholder="问推荐 / 空桌 / 预约流程…" value="${escapeAttr(state.custChatInput || '')}" />
            <button class="btn btn-primary btn-sm" id="btn-cust-chat-send" type="button" ${state.custChatLoading ? 'disabled' : ''}>发送</button>
          </div>
        </div>` : ''}
      <button class="cust-chat-fab" id="btn-cust-chat-toggle" type="button">${open ? '收起' : 'AI 导购'}</button>
    </div>`;
}


// =====================================================================
// =====================================================================
// Phase 2: 桌游目录管理页面
// =====================================================================
async function renderGameManagementPage() {
  const token = window.localStorage.getItem(AUTH_KEY) || '';
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const search = state.gameSearch || '';

  let html = '<div class="page-placeholder"><p>加载中...</p></div>';
  try {
    const url = search ? `/api/games-mgmt/list?search=${encodeURIComponent(search)}` : '/api/games-mgmt/list';
    const res = await fetch(url, { headers: h });
    const data = await res.json();
    const games = data.data || [];

    const diffLabels = {1:'入门',2:'简单',3:'中等',4:'较难',5:'重度'};
    html = `
      <div class="toolbar">
        <div class="search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="game-search-input" placeholder="搜索桌游名称、分类或描述..." value="${escapeAttr(search)}" />
        </div>
        <button class="btn btn-primary" id="btn-add-game">+ 添加桌游</button>
      </div>
      ${games.length === 0
        ? `<div class="empty-state"><div class="icon">🎲</div><h3>暂无桌游</h3><p>点击"添加桌游"来收录第一款游戏</p></div>`
        : `<div class="game-card-grid">
            ${games.map(g => {
              const dif = diffLabels[g.difficulty] || '中等';
              return `
              <div class="game-card" data-game-id="${g.id}">
                ${renderGameCover(g, 'game-card-img')}
                <div class="game-card-body">
                  <h3>${escapeHtml(g.title)}${g.publishYear ? `<small style="font-weight:400;color:var(--text-soft);font-size:13px">${g.publishYear}</small>` : ''}</h3>
                  <p class="meta">${g.minPlayers}-${g.maxPlayers}人 · ${g.avgMinutes}分钟 · ${dif} · ${escapeHtml(g.category)} · 近30天 ${g.recentPlayCount || 0} 次 · 热度 ${Number(g.hotScore || 0).toFixed(0)}</p>
                  ${g.description ? `<p class="desc">${escapeHtml(g.description)}</p>` : ''}
                  <div style="display:flex;gap:6px;margin-top:12px">
                    <button class="btn btn-ghost btn-sm" data-edit-game="${g.id}">编辑</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--rose)" data-delete-game="${g.id}">删除</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>`}
    `;
  } catch (e) { html = '<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>请刷新重试</p></div>'; }

  return `<div class="page-hero"><div class="eyebrow">Game Catalog</div><h2>桌游目录管理</h2><p>浏览、添加和编辑桌游信息与描述</p></div>
    ${html}
    <div id="game-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3 id="game-modal-title">添加桌游</h3><button class="modal-close" id="btn-close-game-modal">&times;</button></div>
        <div class="modal-body">
          <form id="game-form">
            <input type="hidden" name="id" id="game-edit-id" />
            <div class="form-row">
              <div class="form-group" style="flex:2"><label>名称 *</label><input type="text" name="title" class="form-input" required placeholder="桌游名称" id="game-title" /></div>
              <div class="form-group" style="flex:1"><label>分类</label><input type="text" name="category" class="form-input" placeholder="策略/聚会/家庭..." id="game-category" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>最小人数</label><input type="number" name="minPlayers" class="form-input" value="2" min="1" max="20" /></div>
              <div class="form-group"><label>最大人数</label><input type="number" name="maxPlayers" class="form-input" value="6" min="1" max="20" /></div>
              <div class="form-group"><label>难度 (1-5)</label><input type="number" name="difficulty" class="form-input" value="3" min="1" max="5" /></div>
              <div class="form-group"><label>时长(分钟)</label><input type="number" name="avgMinutes" class="form-input" value="90" min="10" max="600" /></div>
            </div>
            <div class="form-group"><label>封面图 URL</label><input type="url" name="coverImageUrl" class="form-input" placeholder="https://..." id="game-cover" /></div>
            <div class="form-group"><label>描述 / 规则简介 <button type="button" class="btn btn-ghost btn-sm" id="btn-ai-desc" style="float:right;padding:2px 10px">✨ AI 生成</button></label><textarea name="description" class="form-input" placeholder="输入桌游描述、规则要点..." id="game-desc"></textarea></div>
            <div class="form-row">
              <div class="form-group"><label>出版社</label><input type="text" name="publisher" class="form-input" placeholder="出版社名称" id="game-publisher" /></div>
              <div class="form-group"><label>出版年份</label><input type="number" name="publishYear" class="form-input" placeholder="2024" min="1900" max="2100" id="game-year" /></div>
              <div class="form-group"><label>BGG ID</label><input type="text" name="bggId" class="form-input" placeholder="如: 13" id="game-bggid" /></div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-game">取消</button>
          <button class="btn btn-primary" id="btn-save-game">保存</button>
        </div>
      </div>
    </div>`;
}

// =====================================================================
// Phase 2: 员工权限管理页面
// =====================================================================
async function renderStaffAdminPage() {
  const isManager = state.currentUser?.role === 'admin';
  const roleLabel = (role) => (role === 'admin' ? '店长' : '员工');

  let html = '';
  try {
    if (!isManager) {
      return `<div class="page-hero"><div class="eyebrow">Staff</div><h2>员工与权限</h2><p>员工账号可以使用预约、开台、会员和战绩功能；店长账号可以管理员工与权限。</p></div>
        <div class="apple-card"><p style="text-align:center;color:var(--text-muted)">当前账号权限：员工。如需调整账号或新增员工，请使用店长账号登录。</p></div>`;
    }
    const staffData = await api('/api/staff-mgmt/list');
    const staff = staffData.data || [];
    state.staff = staff;
    const q = String(state.staffSearch || '').trim().toLowerCase();
    const visibleStaff = q
      ? staff.filter((s) => [s.fullName, s.displayName, s.username, s.employeeNo, s.phone, s.position].some((v) => String(v || '').toLowerCase().includes(q)))
      : staff;
    const managers = staff.filter((s) => s.role === 'admin' && s.status === 'active').length;
    const employees = staff.filter((s) => s.role !== 'admin' && s.status === 'active').length;
    const active = staff.filter((s) => s.status === 'active').length;

    html = `
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-value">${staff.length}</div><div class="stat-label">账号总数</div></div>
        <div class="stat-card"><div class="stat-value">${managers}</div><div class="stat-label">店长</div></div>
        <div class="stat-card"><div class="stat-value">${employees}</div><div class="stat-label">员工</div></div>
        <div class="stat-card"><div class="stat-value">${active}</div><div class="stat-label">启用中</div></div>
      </div>
      <div class="toolbar" style="align-items:center">
        <div class="search-bar" style="flex:1"><input type="text" data-field="staffSearch" placeholder="搜索姓名、账号、工号、手机号或岗位" value="${escapeAttr(state.staffSearch)}" /></div>
        <button class="btn btn-primary" id="btn-add-staff" type="button">+ 添加员工</button>
      </div>
      <div class="apple-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>员工档案</th><th>后台账号</th><th>权限</th><th>岗位</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            ${visibleStaff.length === 0 ? '<tr><td colspan="7" class="empty">暂无员工</td></tr>' : visibleStaff.map(s => {
              const isMe = s.id === state.currentUser?.id;
              return `
              <tr style="${isMe ? 'background:var(--primary-soft)' : ''}">
                <td><strong>${escapeHtml(s.fullName||s.displayName)}</strong>${isMe ? ' <span class="badge badge-blue">你</span>' : ''}<br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(s.employeeNo||'')} · ${escapeHtml(s.phone || '未填手机号')}</span></td>
                <td><strong>${escapeHtml(s.username)}</strong><br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(s.displayName || '')}</span></td>
                <td><span class="badge ${s.role==='admin'?'badge-blue':'badge-green'}">${roleLabel(s.role)}</span></td>
                <td>${escapeHtml(s.position||'')}</td>
                <td><span class="badge ${s.status==='active'?'badge-green':'badge-rose'}">${s.status==='active'?'启用':'禁用'}</span></td>
                <td style="font-size:13px;color:var(--text-muted)">${new Date(s.createdAt).toLocaleDateString('zh-CN')}</td>
                <td><div class="action-group">
                  <button class="btn btn-ghost btn-sm" data-edit-staff-account="${s.id}" type="button">编辑</button>
                  ${isMe
                    ? '<span style="font-size:12px;color:var(--text-soft)">当前账号</span>'
                    : `<button class="btn btn-secondary btn-sm" data-toggle-role="${s.id}" data-current-role="${s.role}" type="button">${s.role==='admin'?'设为员工':'设为店长'}</button>
                       <button class="btn btn-ghost btn-sm" style="color:${s.status==='active'?'var(--rose)':'var(--green)'}" data-toggle-status="${s.id}" data-current-status="${s.status}" type="button">${s.status==='active'?'停用':'启用'}</button>`}
                </div></td>
              </tr>`;}).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    html = '<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>请确认当前账号是店长，且后端服务正常。</p></div>';
  }

  return `<div class="page-hero"><div class="eyebrow">Staff</div><h2>员工与权限</h2><p>单店只保留两级权限：店长负责员工、目录、优惠和租借设置；员工负责日常预约、开台、会员与战绩。</p></div>
    ${html}
    <div id="staff-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3 id="staff-modal-title">添加员工</h3><button class="modal-close" id="btn-close-staff-modal">&times;</button></div>
        <div class="modal-body">
          <form id="staff-form">
            <input type="hidden" name="id" id="staff-edit-id" />
            <div class="form-row">
              <div class="form-group"><label>登录账号 *</label><input type="text" name="username" id="staff-username" class="form-input" required placeholder="登录名" /></div>
              <div class="form-group"><label>显示名称 *</label><input type="text" name="displayName" id="staff-display-name" class="form-input" required placeholder="显示名称" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>密码 <span id="staff-password-hint">*</span></label><input type="password" name="password" id="staff-password" class="form-input" placeholder="新增必填；编辑时留空不修改" /></div>
              <div class="form-group"><label>权限</label><select name="role" id="staff-role" class="form-input"><option value="staff">员工</option><option value="admin">店长</option></select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>真实姓名</label><input type="text" name="fullName" id="staff-full-name" class="form-input" placeholder="员工真实姓名" /></div>
              <div class="form-group"><label>岗位</label><input type="text" name="position" id="staff-position" class="form-input" placeholder="如：店长、店员" value="店员" /></div>
            </div>
            <div class="form-group"><label>手机号</label><input type="tel" name="phone" id="staff-phone" class="form-input" placeholder="手机号" /></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-staff">取消</button>
          <button class="btn btn-primary" id="btn-save-staff">保存</button>
        </div>
      </div>
    </div>`;
}

// =====================================================================
// Phase 2: 优惠券管理页面
// =====================================================================
async function renderCouponsPage() {
  const token = window.localStorage.getItem(AUTH_KEY) || '';
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  let html = '<div class="empty-state"><p>加载中...</p></div>';
  try {
    const res = await fetch('/api/coupons-mgmt/list', { headers: h });
    const data = await res.json();
    const coupons = data.data || [];
    const typeMap = { discount_fixed: '满减', discount_percent: '折扣', newbie: '新人券' };

    html = `
      <div class="toolbar" style="padding-top:28px">
        <div class="search-bar" style="flex:1"><input type="text" placeholder="搜索优惠券..." disabled /></div>
        <button class="btn btn-primary" id="btn-create-coupon">+ 创建优惠券</button>
      </div>
      <div class="apple-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>名称</th><th>类型</th><th>优惠</th><th>最低消费</th><th>发放/总量</th><th>有效期</th></tr></thead>
          <tbody>${coupons.length === 0 ? '<tr><td colspan="6" class="empty">暂无优惠券</td></tr>'
            : coupons.map(c => {
                const val = c.type === 'discount_percent' ? `${c.value/100}%` : `¥${(c.value/100).toFixed(0)}`;
                return `<tr>
                  <td style="font-weight:600">${escapeHtml(c.name)}</td>
                  <td><span class="badge badge-blue">${typeMap[c.type]||c.type}</span></td>
                  <td>${val}</td>
                  <td>¥${(c.minAmount/100).toFixed(0)}</td>
                  <td>${c.usedQty}/${c.totalQty}</td>
                  <td style="font-size:13px;color:var(--text-muted)">${new Date(c.startAt).toLocaleDateString()} ~ ${new Date(c.endAt).toLocaleDateString()}</td>
                </tr>`;
              }).join('')}</tbody>
        </table>
      </div>`;
  } catch (e) { html = '<div class="empty-state"><h3>加载失败</h3></div>'; }

  return `<div class="page-hero"><div class="eyebrow">Coupons</div><h2>优惠券管理</h2><p>创建、发放和追踪优惠券效果</p></div>${html}
    <div id="coupon-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3>创建优惠券</h3><button class="modal-close" id="btn-close-coupon-modal">&times;</button></div>
        <div class="modal-body"><form id="coupon-form">
          <div class="form-group"><label>名称 *</label><input type="text" name="name" class="form-input" required placeholder="如：春节满100减15" /></div>
          <div class="form-row">
            <div class="form-group"><label>类型</label><select name="type" class="form-input"><option value="discount_fixed">满减</option><option value="discount_percent">折扣（百分比）</option><option value="newbie">新人券</option></select></div>
            <div class="form-group"><label>优惠值（满减=分，折扣=百分值）</label><input type="number" name="value" class="form-input" required placeholder="1500" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>最低消费（分）</label><input type="number" name="minAmount" class="form-input" value="0" /></div>
            <div class="form-group"><label>发放总量</label><input type="number" name="totalQty" class="form-input" required placeholder="100" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>开始日期</label><input type="datetime-local" name="startAt" class="form-input" required /></div>
            <div class="form-group"><label>结束日期</label><input type="datetime-local" name="endAt" class="form-input" required /></div>
          </div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-coupon">取消</button>
          <button class="btn btn-primary" id="btn-save-coupon">保存</button>
        </div>
      </div>
    </div>`;
}

// =====================================================================
// Phase 2: 订单与计费页面
// =====================================================================
async function renderBillingPage() {
  const token = window.localStorage.getItem(AUTH_KEY) || '';
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  let html = '<div class="empty-state"><p>加载中...</p></div>';
  try {
    const [statsRes, ordersRes] = await Promise.all([
      fetch('/api/billing-mgmt/stats', { headers: h }),
      fetch('/api/billing-mgmt/orders', { headers: h }),
    ]);
    const stats = await statsRes.json();
    const ordersData = await ordersRes.json();
    const orders = ordersData.data || [];
    const statusMap = { pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' };
    const color = (s) => s==='paid'?'badge-green':s==='pending'?'badge-amber':'badge-rose';

    html = `
      <div class="stat-grid" style="padding-top:28px">
        <div class="stat-card"><div class="stat-value">${stats.totalOrders||0}</div><div class="stat-label">总订单数</div></div>
        <div class="stat-card"><div class="stat-value">${stats.paidOrders||0}</div><div class="stat-label">已支付</div></div>
        <div class="stat-card"><div class="stat-value">¥${((stats.totalRevenue||0)/100).toFixed(0)}</div><div class="stat-label">总收入</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--rose)">¥${((stats.totalDiscount||0)/100).toFixed(0)}</div><div class="stat-label">总优惠</div></div>
      </div>
      <div class="apple-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>订单号</th><th>会员</th><th>原价</th><th>折扣</th><th>实付</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>${orders.length === 0 ? '<tr><td colspan="7" class="empty">暂无订单</td></tr>'
            : orders.map(o => `<tr>
              <td><code style="font-size:12px">${escapeHtml(o.orderNo)}</code></td>
              <td>${escapeHtml(o.playerName||'散客')}</td>
              <td>¥${(o.amountCents/100).toFixed(2)}</td>
              <td style="color:var(--rose)">-¥${(o.discountCents/100).toFixed(2)}</td>
              <td style="font-weight:700">¥${(o.finalCents/100).toFixed(2)}</td>
              <td><span class="badge ${color(o.status)}">${statusMap[o.status]||o.status}</span></td>
              <td style="font-size:13px;color:var(--text-muted)">${new Date(o.createdAt).toLocaleString()}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } catch (e) { html = '<div class="empty-state"><h3>加载失败</h3></div>'; }

  return `<div class="page-hero"><div class="eyebrow">Billing</div><h2>订单与计费</h2><p>查看订单列表、收入统计和优惠分析</p></div>${html}`;
}

// =====================================================================
// Phase B: 桌游租借管理页
// =====================================================================
async function renderRentalPage() {
  const token = window.localStorage.getItem(AUTH_KEY) || '';
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const tab = state.rentalTab || 'active';

  let stats = { total: 0, available: 0, lent: 0, overdueLoans: 0, activeLoans: 0, maintenance: 0 };
  let rows = [];
  try {
    const [statsRes, loansRes] = await Promise.all([
      fetch('/api/rental/stats', { headers: h }),
      fetch(`/api/rental/loans?status=${tab === 'copies' ? 'active' : tab}`, { headers: h }),
    ]);
    stats = await statsRes.json();
    if (tab !== 'copies') rows = (await loansRes.json()).data || [];
  } catch (e) { /* fall through to empty */ }

  let copies = [];
  if (tab === 'copies') {
    try {
      const res = await fetch('/api/rental/copies', { headers: h });
      copies = (await res.json()).data || [];
    } catch (e) { /* empty */ }
  }

  const statCards = `
    <div class="stat-grid" style="padding-top:28px">
      <div class="stat-card"><div class="stat-value">${stats.total||0}</div><div class="stat-label">副本总数</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--green)">${stats.available||0}</div><div class="stat-label">可借出</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--amber)">${stats.lent||0}</div><div class="stat-label">借出中</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--rose)">${stats.overdueLoans||0}</div><div class="stat-label">已逾期</div></div>
    </div>`;

  const tabs = `
    <div class="tabs">
      <button class="tab ${tab==='active'?'active':''}" data-rental-tab="active">借出中</button>
      <button class="tab ${tab==='overdue'?'active':''}" data-rental-tab="overdue">已逾期</button>
      <button class="tab ${tab==='returned'?'active':''}" data-rental-tab="returned">已归还</button>
      <button class="tab ${tab==='copies'?'active':''}" data-rental-tab="copies">库存副本</button>
    </div>`;

  let body;
  if (tab === 'copies') {
    body = renderRentalCopiesTable(copies);
  } else {
    body = renderRentalLoansTable(rows, tab);
  }

  const toolbar = `
    <div class="toolbar">
      <div style="flex:1"></div>
      ${tab === 'copies'
        ? '<button class="btn btn-primary" id="btn-add-copy">+ 新增副本</button>'
        : '<button class="btn btn-primary" id="btn-new-loan">+ 借出登记</button>'}
    </div>`;

  return `<div class="page-hero"><div class="eyebrow">Rental</div><h2>桌游租借管理</h2><p>管理实体桌游库存、借出归还、押金与逾期</p></div>
    ${statCards}
    ${tabs}
    ${toolbar}
    <div class="apple-card" style="padding:0;overflow:hidden">${body}</div>
    ${renderRentalModals()}`;
}

function renderRentalLoansTable(rows, tab) {
  if (!rows.length) return `<div class="empty-state" style="padding:40px"><div class="icon">📦</div><h3>暂无记录</h3></div>`;
  return `
    <table class="data-table">
      <thead><tr><th>桌游</th><th>借出人</th><th>借出时间</th><th>应还时间</th><th>押金</th><th>状态</th>${tab!=='returned'?'<th>操作</th>':'<th>归还时间</th>'}</tr></thead>
      <tbody>
        ${rows.map(l => {
          const overdue = l.isOverdue && l.status === 'active';
          const statusBadge = l.status === 'returned'
            ? '<span class="badge badge-green">已归还</span>'
            : l.status === 'lost' ? '<span class="badge badge-rose">丢失</span>'
            : overdue ? '<span class="badge badge-rose">逾期</span>' : '<span class="badge badge-amber">借出中</span>';
          return `<tr>
            <td><strong>${escapeHtml(l.gameTitle)}</strong>${l.barcode?`<br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(l.barcode)}</span>`:''}</td>
            <td>${escapeHtml(l.playerName||'散客')}${l.playerPhone?`<br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(l.playerPhone)}</span>`:''}</td>
            <td style="font-size:13px">${formatDateTime(l.borrowedAt)}</td>
            <td style="font-size:13px;${overdue?'color:var(--rose);font-weight:700':''}">${l.dueAt?formatDateTime(l.dueAt):'—'}</td>
            <td>¥${((l.depositCents||0)/100).toFixed(0)}</td>
            <td>${statusBadge}</td>
            ${tab!=='returned'
              ? `<td><div class="action-group">
                  <button class="btn btn-secondary btn-sm" data-loan-return="${l.id}" type="button">归还</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--rose)" data-loan-lost="${l.id}" type="button">标记丢失</button>
                </div></td>`
              : `<td style="font-size:13px">${l.returnedAt?formatDateTime(l.returnedAt):'—'}</td>`}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderRentalCopiesTable(copies) {
  if (!copies.length) return `<div class="empty-state" style="padding:40px"><div class="icon">🎲</div><h3>暂无副本</h3><p>点击"新增副本"登记实体桌游</p></div>`;
  const statusMap = { available: ['可借','badge-green'], lent: ['借出中','badge-amber'], maintenance: ['维护中','badge-blue'], lost: ['丢失','badge-rose'] };
  return `
    <table class="data-table">
      <thead><tr><th>桌游</th><th>条码</th><th>位置</th><th>建议押金</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        ${copies.map(c => {
          const [label, cls] = statusMap[c.status] || [c.status, 'badge-blue'];
          return `<tr>
            <td><strong>${escapeHtml(c.gameTitle)}</strong></td>
            <td>${escapeHtml(c.barcode||'—')}</td>
            <td>${escapeHtml(c.location||'—')}</td>
            <td>¥${((c.depositCents||0)/100).toFixed(0)}</td>
            <td><span class="badge ${cls}">${label}</span></td>
            <td>${c.status!=='lent'?`<button class="btn btn-ghost btn-sm" style="color:var(--rose)" data-copy-delete="${c.id}" type="button">删除</button>`:'<span style="font-size:12px;color:var(--text-soft)">借出中</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderRentalModals() {
  const gameOptions = state.games.map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join('');
  const playerOptions = state.players.map((p) => `<option value="${p.id}">${escapeHtml(p.displayName)}</option>`).join('');
  return `
    <div id="loan-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3>借出登记</h3><button class="modal-close" id="btn-close-loan-modal">&times;</button></div>
        <div class="modal-body">
          <div class="form-group"><label>桌游 *</label><select class="form-input" data-field="rentalLoanGameId"><option value="">选择桌游…</option>${gameOptions}</select></div>
          <div class="form-group"><label>可借副本 *</label><select class="form-input" id="loan-copy-select" data-field="rentalLoanCopyId"><option value="">请先选择桌游</option></select></div>
          <div class="form-group"><label>借出人（会员）</label><select class="form-input" data-field="rentalLoanPlayerId"><option value="">散客</option>${playerOptions}</select></div>
          <div class="form-row">
            <div class="form-group"><label>应还时间</label><input type="datetime-local" class="form-input" data-field="rentalLoanDueAt" value="${escapeAttr(state.rentalLoanDueAt)}" /></div>
            <div class="form-group"><label>押金（元）</label><input type="number" class="form-input" data-field="rentalLoanDeposit" value="${escapeAttr(state.rentalLoanDeposit)}" /></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-loan">取消</button>
          <button class="btn btn-primary" id="btn-save-loan">确认借出</button>
        </div>
      </div>
    </div>
    <div id="copy-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3>新增副本</h3><button class="modal-close" id="btn-close-copy-modal">&times;</button></div>
        <div class="modal-body">
          <div class="form-group"><label>桌游 *</label><select class="form-input" data-field="rentalNewCopyGameId"><option value="">选择桌游…</option>${gameOptions}</select></div>
          <div class="form-row">
            <div class="form-group"><label>条码/编号</label><input type="text" class="form-input" data-field="rentalNewCopyBarcode" value="${escapeAttr(state.rentalNewCopyBarcode)}" placeholder="如 BG-001" /></div>
            <div class="form-group"><label>存放位置</label><input type="text" class="form-input" data-field="rentalNewCopyLocation" value="${escapeAttr(state.rentalNewCopyLocation)}" placeholder="如 A架2层" /></div>
          </div>
          <div class="form-group"><label>建议押金（元）</label><input type="number" class="form-input" data-field="rentalNewCopyDeposit" value="${escapeAttr(state.rentalNewCopyDeposit)}" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-copy">取消</button>
          <button class="btn btn-primary" id="btn-save-copy">保存</button>
        </div>
      </div>
    </div>`;
}

// =====================================================================
// Phase D: AI 经营助手页
// =====================================================================
function renderAiAssistantPage() {
  const suggestions = ['今天生意怎么样？', '推荐 4 人玩 2 小时的策略游戏', '有什么适合新手的桌游？', '现在有多少空桌？', '哪些桌游最受欢迎？'];
  const messages = state.aiMessages || [];
  const bubbles = messages.length
    ? messages
        .map((m) => `
          <div class="ai-msg ai-msg--${m.role}">
            <div class="ai-bubble">${escapeHtml(m.content)}</div>
          </div>`)
        .join('')
    : `<div class="ai-empty">
        <div class="ai-empty-icon">🤖</div>
        <p>问我经营数据、桌游推荐、运营建议的任何问题</p>
        <div class="ai-suggestions">
          ${suggestions.map((s) => `<button class="ai-chip" data-ai-suggest="${escapeAttr(s)}" type="button">${escapeHtml(s)}</button>`).join('')}
        </div>
      </div>`;

  return `<div class="page-hero"><div class="eyebrow">AI Assistant</div><h2>AI 经营助手</h2><p>用自然语言查询经营数据、智能推荐桌游、获取运营建议</p></div>
    <div class="ai-chat-panel apple-card" style="padding:0;overflow:hidden">
      <div class="ai-chat-log" id="ai-chat-log">
        ${bubbles}
        ${state.aiLoading ? '<div class="ai-msg ai-msg--assistant"><div class="ai-bubble ai-typing"><span class="loading loading-dots loading-sm"></span> 思考中</div></div>' : ''}
      </div>
      <div class="ai-chat-input">
        <input class="input" data-field="aiInput" id="ai-input" placeholder="输入问题，回车发送…" value="${escapeAttr(state.aiInput)}" />
        <button class="btn btn-primary" id="btn-ai-send" type="button" ${state.aiLoading ? 'disabled' : ''}>发送</button>
      </div>
    </div>`;
}

// 常驻 AI 桌宠（骰子猫）：后台所有页右下角浮动，点击弹聊天窗
function renderPetWidget() {
  const open = state.petOpen;
  const messages = state.petMessages || [];
  const bubbles = messages.length
    ? messages.map((m) => `<div class="ai-msg ai-msg--${m.role}"><div class="ai-bubble">${escapeHtml(m.content)}</div></div>`).join('')
    : '<div class="cust-chat-hello">喵～我是骰子猫 🐾 问我经营数据、桌游推荐都行！</div>';
  return `
    <div class="pet-widget">
      ${open ? `
        <div class="pet-window">
          <div class="pet-head">
            <strong>🐱 骰子猫助手</strong>
            <button class="cust-chat-close" data-pet-close type="button">×</button>
          </div>
          <div class="pet-log" id="pet-log">
            ${bubbles}
            ${state.petLoading ? '<div class="ai-msg ai-msg--assistant"><div class="ai-bubble ai-typing"><span class="loading loading-dots loading-sm"></span> 喵～想想</div></div>' : ''}
          </div>
          <div class="pet-input">
            <input class="input" id="pet-input" data-field="petInput" placeholder="问问骰子猫…" value="${escapeAttr(state.petInput || '')}" />
            <button class="btn btn-primary btn-sm" data-pet-send type="button" ${state.petLoading ? 'disabled' : ''}>发送</button>
          </div>
        </div>` : ''}
      <button class="pet-fab ${open ? 'is-open' : ''}" data-pet-toggle type="button" title="骰子猫 AI 助手" aria-label="AI 助手">
        <span class="pet-cat">🐱</span>
        ${open ? '' : '<span class="pet-bubble-dot"></span>'}
      </button>
    </div>`;
}

async function renderPageContent(summary) {
  if (state.activePage === 'tables') return renderTablesPage();
  if (state.activePage === 'members') return renderMembersPage();
  if (state.activePage === 'staff') return renderStaffManagementPage();
  if (state.activePage === 'sessions') return renderSessionsPage();
  if (state.activePage === 'reports') return renderReportsPage();
  if (state.activePage === 'games') return await renderGameManagementPage();
  if (state.activePage === 'coupons') return await renderCouponsPage();
  if (state.activePage === 'billing') return await renderBillingPage();
  if (state.activePage === 'rental') return await renderRentalPage();
  if (state.activePage === 'ai') return renderAiAssistantPage();
  if (state.activePage === 'staff-mgmt') return await renderStaffAdminPage();
  return renderDashboardPage(summary);
}

function navigateToPage(pageId) {
  const nextPage = pageIds.has(pageId) ? pageId : defaultPageForLocation();
  if (nextPage === 'customer' && isAdminPath()) {
    window.location.assign('/');
    return;
  }
  if (navigateIds.has(nextPage) && !isAdminPath()) {
    window.location.assign(`${ADMIN_PATH}#/${nextPage}`);
    return;
  }
  const nextHash = `#/${nextPage}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }
  state.activePage = nextPage;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function render() {
  if (state.activePage === 'customer') {
    $('#app').innerHTML = renderPublicCustomerShell();
    bind();
    return;
  }
  if (!state.currentUser) {
    $('#app').innerHTML = renderAuthScreen();
    bind();
    return;
  }
  // 数据大屏：全屏沉浸式布局，绕过侧边栏与顶部栏。
  if (state.activePage === 'screen') {
    $('#app').innerHTML = renderScreenPage(state);
    bind();
    initScreenCharts(state);
    return;
  }
  // 离开大屏时释放 ECharts 实例，避免内存泄漏与重复 resize 监听。
  disposeScreenCharts();
  const summary = counts();
  const page = currentPageMeta();
  const venueName = state.venue?.name || '桌游门店';
  const pageContent = await renderPageContent(summary);
  const hasOwnHeader = page.id === 'games' || page.id === 'staff-mgmt' || page.id === 'coupons' || page.id === 'billing' || page.id === 'rental' || page.id === 'ai';
  $('#app').innerHTML = `
    <div data-theme="bgcafe" class="admin-shell ${state.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
      <aside class="admin-sidebar ${state.sidebarCollapsed ? 'is-collapsed' : ''}">
        <a class="admin-sidebar-brand" href="#/dashboard" data-page="dashboard" title="${escapeAttr(venueName)}">
          <span class="admin-brand-mark">${renderNavIcon('games')}</span>
          ${state.sidebarCollapsed ? '' : `<span class="admin-brand-copy"><strong>${escapeHtml(state.venue?.name || '骰子猫')}</strong><small>单店运营系统</small></span>`}
        </a>
        <nav class="admin-sidebar-nav" aria-label="主导航">
          ${renderNav()}
        </nav>
        <div class="admin-sidebar-footer">
          <button class="admin-sidebar-toggle" data-sidebar-toggle type="button" title="${state.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}">
            <span>${state.sidebarCollapsed ? '»' : '«'}</span>${state.sidebarCollapsed ? '' : '<span>收起侧栏</span>'}
          </button>
          ${state.sidebarCollapsed ? '' : `<span class="admin-sidebar-health">● ${escapeHtml(state.health)}</span>`}
        </div>
      </aside>
      <main class="min-w-0 flex flex-col" id="page-${escapeAttr(page.id)}">
        <header class="admin-topbar">
          <div class="flex items-center gap-3 min-w-0">
            <button class="btn btn-ghost btn-sm btn-circle lg:hidden shrink-0" data-mobile-nav-toggle type="button" aria-label="打开后台菜单">☰</button>
            ${hasOwnHeader ? '' : `<div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-wider text-base-content/45">${escapeHtml(page.eyebrow)}</div><h1 class="m-0 text-lg font-bold tracking-tight truncate">${escapeHtml(page.title)}</h1></div>`}
          </div>
          <div class="admin-topbar-actions">
            ${state.reservations.filter(r => r.status === 'pending').length > 0 ? `<span class="badge badge-warning badge-sm rounded-full font-semibold">${state.reservations.filter(r => r.status === 'pending').length} 待处理</span>` : ''}
            ${state.openSessions.length > 0 ? `<span class="badge badge-info badge-sm rounded-full font-semibold">${state.openSessions.length} 进行中</span>` : ''}
            <span class="text-sm text-base-content/70 max-w-[120px] truncate">${escapeHtml(state.currentUser.displayName || state.currentUser.username)}</span>
            <a class="btn btn-sm rounded-full gap-1 border-0 bg-gradient-to-r from-orange-500 to-purple-600 text-white shadow hover:shadow-lg" href="#/screen" data-page="screen" title="数据大屏">
              <span>📊</span><span class="hidden sm:inline">数据大屏</span>
            </a>
            <button class="btn btn-ghost btn-sm btn-circle" data-refresh title="刷新">↻</button>
            <button class="btn btn-ghost btn-sm rounded-full" data-logout>退出</button>
          </div>
        </header>
        ${state.err ? `<div class="notice mx-5 sm:mx-7 mt-4">${escapeHtml(state.err)}</div>` : ''}
        <div class="admin-page-body page-enter" data-page-key="${escapeAttr(page.id)}">${pageContent}</div>
      </main>
      ${renderMobileNav()}
      ${renderPetWidget()}
    </div>`;
  bind();
}

function bindField(element) {
  const field = element.getAttribute('data-field');
  const sync = () => {
    state[field] = element.type === 'number' ? Number(element.value) : element.value;
  };
  element.addEventListener('input', sync);
  element.addEventListener('change', sync);
}

function bind() {
  const root = $('#app');
  root.querySelectorAll('[data-field]').forEach(bindField);
  root.querySelectorAll('[data-auth-mode]').forEach((button) =>
    button.addEventListener('click', () => {
      state.authMode = button.getAttribute('data-auth-mode');
      render();
    })
  );
  root.querySelectorAll('[data-page]').forEach((link) =>
    link.addEventListener('click', (event) => {
      event.preventDefault();
      state.mobileNavOpen = false;
      navigateToPage(link.getAttribute('data-page'));
    })
  );
  root.querySelector('[data-login]')?.addEventListener('click', () => void onLogin());
  root.querySelector('[data-register]')?.addEventListener('click', () => void onRegister());
  root.querySelector('[data-logout]')?.addEventListener('click', () => void onLogout());
  root.querySelector('[data-sidebar-toggle]')?.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    window.localStorage.setItem(SIDEBAR_KEY, state.sidebarCollapsed ? '1' : '0');
    render();
  });
  root.querySelector('[data-mobile-nav-toggle]')?.addEventListener('click', () => {
    state.mobileNavOpen = true;
    render();
  });
  root.querySelectorAll('[data-mobile-nav-close]').forEach((button) =>
    button.addEventListener('click', () => {
      state.mobileNavOpen = false;
      render();
    })
  );
  root.querySelector('[data-pet-toggle]')?.addEventListener('click', () => { state.petOpen = !state.petOpen; render(); });
  root.querySelector('[data-pet-close]')?.addEventListener('click', () => { state.petOpen = false; render(); });
  root.querySelector('[data-pet-send]')?.addEventListener('click', () => void onPetSend());
  $('#pet-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void onPetSend(); } });
  const petLog = $('#pet-log');
  if (petLog) petLog.scrollTop = petLog.scrollHeight;
  root.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', () => void refresh()));
  root.querySelectorAll('[data-lb-sort]').forEach((button) =>
    button.addEventListener('click', () => {
      state.leaderboardSort = button.getAttribute('data-lb-sort');
      render();
    })
  );
  root.querySelector('[data-field="memberSearch"]')?.addEventListener('change', () => void refresh());
  root.querySelectorAll('[data-table-id]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedId = Number(button.getAttribute('data-table-id'));
      render();
    })
  );
  root.querySelectorAll('[data-member-id]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedMemberId = Number(button.getAttribute('data-member-id'));
      void loadMemberReservations(state.selectedMemberId, { renderAfter: true });
    })
  );
  root.querySelector('[data-field="staffSearch"]')?.addEventListener('input', () => {
    if (state.activePage === 'staff-mgmt') void render();
  });
  root.querySelectorAll('[data-staff-id]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedStaffId = Number(button.getAttribute('data-staff-id'));
      state.editStaffName = '';
      state.editStaffPhone = '';
      state.editStaffPosition = '';
      state.staffAccountUsername = '';
      state.staffAccountPassword = '';
      render();
    })
  );
  root.querySelector('form[data-form="reserve"] [data-field="playerId"]')?.addEventListener('change', () => {
    const player = state.players.find((item) => String(item.id) === String(state.playerId));
    state.guestName = player ? player.displayName : '访客';
    state.guestPhone = player ? player.phone || '' : state.guestPhone;
    render();
  });
  root.querySelector('[data-reserve]')?.addEventListener('click', onReserve);
  root.querySelector('[data-walkin]')?.addEventListener('click', onWalkin);
  root.querySelector('[data-match-tables]')?.addEventListener('click', () => void onMatchTables());
  root.querySelector('[data-settle]')?.addEventListener('click', onSettle);
  root.querySelector('[data-member-create]')?.addEventListener('click', onCreateMember);
  root.querySelectorAll('[data-member-recharge]').forEach((button) => button.addEventListener('click', () => onMemberMoney(button, 'recharge')));
  root.querySelectorAll('[data-member-consume]').forEach((button) => button.addEventListener('click', () => onMemberMoney(button, 'consume')));
  root.querySelectorAll('[data-member-delete]').forEach((button) => button.addEventListener('click', () => onDisableMember(Number(button.getAttribute('data-member-delete')))));
  root.querySelector('[data-staff-create]')?.addEventListener('click', () => void onCreateStaff());
  root.querySelectorAll('[data-staff-update]').forEach((button) => button.addEventListener('click', () => void onUpdateStaff(Number(button.getAttribute('data-staff-update')))));
  root.querySelectorAll('[data-staff-disable]').forEach((button) => button.addEventListener('click', () => void onDisableStaff(Number(button.getAttribute('data-staff-disable')))));
  root.querySelectorAll('[data-staff-account]').forEach((button) => button.addEventListener('click', () => void onCreateStaffAccount(Number(button.getAttribute('data-staff-account')))));
  root.querySelectorAll('[data-checkin]').forEach((button) => button.addEventListener('click', () => void onCheckin(Number(button.getAttribute('data-checkin')))));
  root.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => void onCancel(Number(button.getAttribute('data-cancel')))));
  root.querySelectorAll('[data-reservation-table]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedId = Number(button.getAttribute('data-reservation-table'));
      navigateToPage('tables');
    })
  );
  root.querySelectorAll('[data-match-table]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedId = Number(button.getAttribute('data-match-table'));
      render();
    })
  );
  root.querySelector('[data-customer-match]')?.addEventListener('click', () => void onCustomerMatchTables());
  root.querySelectorAll('[data-customer-table]').forEach((button) =>
    button.addEventListener('click', () => {
      state.customerSelectedTableId = Number(button.getAttribute('data-customer-table'));
      state.customerResult = null;
      render();
    })
  );
  root.querySelector('[data-customer-submit]')?.addEventListener('click', () => void onCustomerSubmit());
  root.querySelector('[data-customer-catalog-toggle]')?.addEventListener('click', () => {
    state.customerCatalogExpanded = !state.customerCatalogExpanded;
    render();
  });
  root.querySelectorAll('[data-customer-auth-mode]').forEach((button) =>
    button.addEventListener('click', () => {
      const shouldScroll = button.hasAttribute('data-customer-auth-scroll');
      state.customerAuthMode = button.getAttribute('data-customer-auth-mode');
      render();
      if (shouldScroll) {
        window.setTimeout(() => document.getElementById('customer-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      }
    })
  );
  root.querySelector('[data-customer-login]')?.addEventListener('click', () => void onCustomerLogin());
  root.querySelector('[data-customer-register]')?.addEventListener('click', () => void onCustomerRegister());
  root.querySelector('[data-customer-logout]')?.addEventListener('click', () => void onCustomerLogout());
  root.querySelectorAll('[data-customer-record]').forEach((button) =>
    button.addEventListener('click', () => openCustomerRecordModal(Number(button.getAttribute('data-customer-record'))))
  );
  root.querySelectorAll('[data-customer-record-close]').forEach((button) =>
    button.addEventListener('click', () => closeCustomerRecordModal())
  );
  root.querySelector('[data-field="customerRecordWinnerMode"]')?.addEventListener('change', () => render());
  root.querySelector('[data-customer-record-submit]')?.addEventListener('click', () => void onCustomerRecordSubmit());

  // ---- Game Management ----
  $('#btn-add-game')?.addEventListener('click', () => openGameModal(null));
  $('#btn-close-game-modal')?.addEventListener('click', closeGameModal);
  $('#btn-cancel-game')?.addEventListener('click', closeGameModal);
  $('#btn-save-game')?.addEventListener('click', () => void onSaveGame());
  $('#btn-ai-desc')?.addEventListener('click', () => void onGenerateDescription());
  $('#game-modal')?.addEventListener('click', (e) => { if (e.target.id === 'game-modal') closeGameModal(); });
  $('#game-search-input')?.addEventListener('input', (e) => {
    state.gameSearch = e.target.value;
    render();
  });
  root.querySelectorAll('[data-edit-game]').forEach(btn => {
    btn.addEventListener('click', () => openGameModal(Number(btn.getAttribute('data-edit-game'))));
  });
  root.querySelectorAll('[data-delete-game]').forEach(btn => {
    btn.addEventListener('click', () => void onDeleteGame(Number(btn.getAttribute('data-delete-game'))));
  });

  // ---- Staff Management ----
  $('#btn-add-staff')?.addEventListener('click', () => openStaffAccountModal(null));
  $('#btn-close-staff-modal')?.addEventListener('click', closeStaffAccountModal);
  $('#btn-cancel-staff')?.addEventListener('click', closeStaffAccountModal);
  $('#btn-save-staff')?.addEventListener('click', () => void onSaveStaffAccount());
  $('#staff-modal')?.addEventListener('click', (e) => { if (e.target.id === 'staff-modal') e.target.style.display = 'none'; });
  root.querySelectorAll('[data-edit-staff-account]').forEach(btn => {
    btn.addEventListener('click', () => openStaffAccountModal(Number(btn.getAttribute('data-edit-staff-account'))));
  });
  root.querySelectorAll('[data-toggle-role]').forEach(btn => {
    btn.addEventListener('click', () => void onToggleStaffRole(Number(btn.getAttribute('data-toggle-role')), btn.getAttribute('data-current-role')));
  });
  root.querySelectorAll('[data-toggle-status]').forEach(btn => {
    btn.addEventListener('click', () => void onToggleStaffStatus(Number(btn.getAttribute('data-toggle-status')), btn.getAttribute('data-current-status')));
  });

  // ---- Coupon Management ----
  $('#btn-create-coupon')?.addEventListener('click', () => { $('#coupon-modal').style.display = 'flex'; });
  $('#btn-close-coupon-modal')?.addEventListener('click', () => { $('#coupon-modal').style.display = 'none'; });
  $('#btn-cancel-coupon')?.addEventListener('click', () => { $('#coupon-modal').style.display = 'none'; });
  $('#btn-save-coupon')?.addEventListener('click', () => void onSaveCoupon());
  $('#coupon-modal')?.addEventListener('click', (e) => { if (e.target.id === 'coupon-modal') e.target.style.display = 'none'; });

  // ---- Rental Management ----
  root.querySelectorAll('[data-rental-tab]').forEach((button) =>
    button.addEventListener('click', () => {
      state.rentalTab = button.getAttribute('data-rental-tab');
      render();
    })
  );
  $('#btn-new-loan')?.addEventListener('click', () => { populateLoanCopies(); $('#loan-modal').style.display = 'flex'; });
  $('#btn-close-loan-modal')?.addEventListener('click', () => { $('#loan-modal').style.display = 'none'; });
  $('#btn-cancel-loan')?.addEventListener('click', () => { $('#loan-modal').style.display = 'none'; });
  $('#btn-save-loan')?.addEventListener('click', () => void onSaveLoan());
  $('#loan-modal')?.addEventListener('click', (e) => { if (e.target.id === 'loan-modal') e.target.style.display = 'none'; });
  root.querySelector('[data-field="rentalLoanGameId"]')?.addEventListener('change', () => void populateLoanCopies());
  $('#btn-add-copy')?.addEventListener('click', () => { $('#copy-modal').style.display = 'flex'; });
  $('#btn-close-copy-modal')?.addEventListener('click', () => { $('#copy-modal').style.display = 'none'; });
  $('#btn-cancel-copy')?.addEventListener('click', () => { $('#copy-modal').style.display = 'none'; });
  $('#btn-save-copy')?.addEventListener('click', () => void onSaveCopy());
  $('#copy-modal')?.addEventListener('click', (e) => { if (e.target.id === 'copy-modal') e.target.style.display = 'none'; });
  root.querySelectorAll('[data-loan-return]').forEach((button) =>
    button.addEventListener('click', () => void onReturnLoan(Number(button.getAttribute('data-loan-return')), false)));
  root.querySelectorAll('[data-loan-lost]').forEach((button) =>
    button.addEventListener('click', () => void onReturnLoan(Number(button.getAttribute('data-loan-lost')), true)));
  root.querySelectorAll('[data-copy-delete]').forEach((button) =>
    button.addEventListener('click', () => void onDeleteCopy(Number(button.getAttribute('data-copy-delete')))));

  // ---- AI Assistant ----
  $('#btn-ai-send')?.addEventListener('click', () => void onAiSend());
  $('#ai-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void onAiSend(); } });
  root.querySelectorAll('[data-ai-suggest]').forEach((button) =>
    button.addEventListener('click', () => { state.aiInput = button.getAttribute('data-ai-suggest'); void onAiSend(); }));
  const log = $('#ai-chat-log');
  if (log) log.scrollTop = log.scrollHeight;

  // ---- Customer chat widget ----
  $('#btn-cust-chat-toggle')?.addEventListener('click', () => { state.custChatOpen = !state.custChatOpen; render(); });
  $('#btn-cust-chat-close')?.addEventListener('click', () => { state.custChatOpen = false; render(); });
  $('#btn-cust-chat-send')?.addEventListener('click', () => void onCustChatSend());
  $('#cust-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void onCustChatSend(); } });
  const custLog = $('#cust-chat-log');
  if (custLog) custLog.scrollTop = custLog.scrollHeight;
}

async function onLogin() {
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: state.loginUsername,
        password: state.loginPassword,
      }),
    });
    setAuth(result.token, result.user);
    await enterAuthenticatedApp();
    showToast('登录成功');
    await refresh();
    ensureRefreshTimer();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onRegister() {
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: state.registerUsername,
        displayName: state.registerDisplayName,
        password: state.registerPassword,
      }),
    });
    setAuth(result.token, result.user);
    await enterAuthenticatedApp();
    state.registerPassword = '';
    showToast('账号已创建');
    await refresh();
    ensureRefreshTimer();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onLogout() {
  try {
    if (state.authToken) {
      await api('/api/auth/logout', { method: 'POST' });
    }
  } catch {
    // Local logout should still work if the server is unavailable.
  }
  setAuth('', null);
  render();
}

async function onCustomerLogin() {
  try {
    const result = await customerApi('/api/public/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: state.customerLoginPhone,
        password: state.customerLoginPassword,
      }),
    });
    setCustomerAuth(result.token, result.player);
    state.customerLoginPassword = '';
    showToast('玩家登录成功');
    await loadCustomerReservations({ renderAfter: true });
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCustomerRegister() {
  try {
    const result = await customerApi('/api/public/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        displayName: state.customerRegisterName,
        phone: state.customerRegisterPhone,
        password: state.customerRegisterPassword,
      }),
    });
    setCustomerAuth(result.token, result.player);
    state.customerRegisterPassword = '';
    state.customerAuthMode = 'login';
    showToast('玩家账号已创建');
    await loadCustomerReservations({ renderAfter: true });
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCustomerLogout() {
  try {
    if (state.customerToken) await customerApi('/api/public/auth/logout', { method: 'POST' });
  } catch {
    // Local logout should still work.
  }
  setCustomerAuth('', null);
  state.customerReservations = [];
  closeCustomerRecordModal(false);
  render();
}

function openCustomerRecordModal(reservationId) {
  state.customerRecordReservationId = reservationId;
  state.customerRecordGameId = state.customerRecordGameId || state.games[0]?.id || '';
  state.customerRecordWinnerMode = 'self';
  state.customerRecordWinnerName = '';
  state.customerRecordScore = '';
  render();
}

function closeCustomerRecordModal(renderAfter = true) {
  state.customerRecordReservationId = null;
  state.customerRecordWinnerName = '';
  state.customerRecordScore = '';
  if (renderAfter) render();
}

async function onCustomerRecordSubmit() {
  const reservation = customerRecordReservation();
  if (!reservation) return;
  if (!state.customerRecordGameId) {
    showToast('请选择本局桌游。', 'err');
    return;
  }
  try {
    await customerApi(`/api/public/me/reservations/${reservation.id}/records`, {
      method: 'POST',
      body: JSON.stringify({
        gameId: Number(state.customerRecordGameId),
        winnerMode: state.customerRecordWinnerMode,
        winnerDisplayName: state.customerRecordWinnerName,
        scoreNote: state.customerRecordScore,
      }),
    });
    showToast('战绩已提交');
    closeCustomerRecordModal(false);
    await loadCustomerReservations({ renderAfter: true });
  } catch (error) {
    showToast(error.message, 'err');
  }
}

function normalizedPartySize(value) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value || 1))));
}

function hasInvalidTimeRange(startAt, endAt) {
  const start = parseAppDate(startAt);
  const end = parseAppDate(endAt);
  return !start || !end || start >= end;
}

function assertTableCapacity(table, partySize) {
  if (!table) return false;
  if (Number(table.seatCapacity || 0) < partySize) {
    showToast(`${table.code} 是 ${table.seatCapacity || 0} 人桌，不能接待 ${partySize} 人，请匹配或选择更大桌位/包间。`, 'err');
    return false;
  }
  return true;
}

async function fetchTableMatches(partySize, startAt, endAt) {
  const url = `/api/recommendations/tables?partySize=${partySize}&startAt=${encodeURIComponent(localInputToMysqlDatetime(startAt))}&endAt=${encodeURIComponent(localInputToMysqlDatetime(endAt))}`;
  return api(url);
}

async function onMatchTables() {
  const partySize = normalizedPartySize(state.partySize);
  state.partySize = partySize;
  if (hasInvalidTimeRange(state.startAt, state.endAt)) {
    showToast('请先填写有效的开始和结束时间。', 'err');
    return;
  }

  try {
    const matches = state.mode === 'demo'
      ? demoData.tableRecommendations.filter((table) => Number(table.seatCapacity || 0) >= partySize)
      : await fetchTableMatches(partySize, state.startAt, state.endAt);
    state.tableRecommendations = matches;
    state.tableMatchUpdatedAt = new Date().toISOString();
    if (matches[0]) state.selectedId = matches[0].tableId;
    showToast(matches.length ? `已匹配到 ${matches.length} 个可用桌位` : '当前时段没有容量合适的空闲桌位');
    render();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCustomerMatchTables() {
  const partySize = normalizedPartySize(state.customerPartySize);
  state.customerPartySize = partySize;
  state.customerResult = null;
  if (hasInvalidTimeRange(state.customerStartAt, state.customerEndAt)) {
    showToast('请先填写有效的到店和离店时间。', 'err');
    return;
  }

  try {
    const matches = await fetchTableMatches(partySize, state.customerStartAt, state.customerEndAt);
    state.customerMatches = matches;
    state.customerSelectedTableId = matches[0]?.tableId || '';
    showToast(matches.length ? `已匹配到 ${matches.length} 个可预约桌位` : '当前时段没有合适桌位，请调整人数或时间');
    render();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCustomerSubmit() {
  const partySize = normalizedPartySize(state.customerPartySize);
  const guestName = String(state.customerGuestName || '').trim();
  const guestPhone = String(state.customerPhone || '').trim();
  state.customerPartySize = partySize;

  if (!state.customerPlayer && (!guestName || !guestPhone)) {
    showToast('请填写姓名和联系电话。', 'err');
    return;
  }
  if (hasInvalidTimeRange(state.customerStartAt, state.customerEndAt)) {
    showToast('请先填写有效的到店和离店时间。', 'err');
    return;
  }

  try {
    const result = await customerApi('/api/public/reservations', {
      method: 'POST',
      body: JSON.stringify({
        tableId: state.customerSelectedTableId || null,
        guestName,
        guestPhone,
        partySize,
        reservedStart: localInputToMysqlDatetime(state.customerStartAt),
        reservedEnd: localInputToMysqlDatetime(state.customerEndAt),
      }),
    });
    state.customerResult = result;
    showToast(`预约已提交：${result.tableCode || '系统已分配桌位'}`);
    if (state.customerPlayer) await loadCustomerReservations();
    if (state.currentUser) await refresh();
    else render();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCreateMember() {
  if (!requireLive()) return;
  try {
    const result = await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({
        displayName: state.newMemberName,
        phone: state.newMemberPhone,
        initialBalanceYuan: Number(state.newMemberBalance || 0),
      }),
    });
    state.selectedMemberId = result.id;
    state.newMemberName = '';
    state.newMemberPhone = '';
    state.newMemberBalance = '100';
    showToast('会员已新增');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onMemberMoney(button, type) {
  if (!requireLive()) return;
  const id = Number(button.getAttribute(type === 'recharge' ? 'data-member-recharge' : 'data-member-consume'));
  try {
    await api(`/api/members/${id}/${type}`, {
      method: 'POST',
      body: JSON.stringify({ amountYuan: Number(state.memberAmount || 0) }),
    });
    showToast(type === 'recharge' ? '充值成功' : '扣费成功');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onDisableMember(id) {
  if (!requireLive()) return;
  if (!window.confirm('确定停用该会员吗？历史预约和战绩会保留。')) return;
  try {
    await api(`/api/members/${id}`, { method: 'DELETE' });
    state.selectedMemberId = null;
    showToast('会员已停用');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCreateStaff() {
  if (!requireLive()) return;
  try {
    const result = await api('/api/staff', {
      method: 'POST',
      body: JSON.stringify({
        fullName: state.newStaffName,
        phone: state.newStaffPhone,
        position: state.newStaffPosition || '店员',
      }),
    });
    state.selectedStaffId = result.id;
    state.newStaffName = '';
    state.newStaffPhone = '';
    state.newStaffPosition = '店员';
    showToast(`员工档案已创建，员工号 ${result.employeeNo}`);
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onUpdateStaff(id) {
  if (!requireLive()) return;
  const selected = state.staff.find((item) => Number(item.id) === Number(id));
  if (!selected) return;
  try {
    await api(`/api/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: state.editStaffName || selected.fullName,
        phone: state.editStaffPhone || selected.phone || null,
        position: state.editStaffPosition || selected.position || '店员',
        status: selected.status || 'active',
      }),
    });
    state.editStaffName = '';
    state.editStaffPhone = '';
    state.editStaffPosition = '';
    showToast('员工档案已保存');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onDisableStaff(id) {
  if (!requireLive()) return;
  if (Number(state.currentUser?.staffId) === Number(id)) {
    showToast('不能停用当前登录员工。', 'err');
    return;
  }
  if (!window.confirm('确定停用该员工吗？绑定的后台账号也会停用。')) return;
  try {
    await api(`/api/staff/${id}`, { method: 'DELETE' });
    state.selectedStaffId = null;
    showToast('员工已停用');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCreateStaffAccount(id) {
  if (!requireLive()) return;
  try {
    await api(`/api/staff/${id}/account`, {
      method: 'POST',
      body: JSON.stringify({
        username: state.staffAccountUsername,
        password: state.staffAccountPassword,
        role: state.staffAccountRole || 'staff',
      }),
    });
    state.staffAccountUsername = '';
    state.staffAccountPassword = '';
    state.staffAccountRole = 'staff';
    showToast('后台账号已创建');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onReserve() {
  const table = selectedTable();
  if (!table || !requireLive()) return;
  const reservationPlayerId = state.playerId === '' ? null : Number(state.playerId);
  const partySize = normalizedPartySize(state.partySize);
  if (!assertTableCapacity(table, partySize)) return;
  const player = Number.isFinite(reservationPlayerId)
    ? state.players.find((item) => Number(item.id) === reservationPlayerId)
    : null;
  const guestName = player?.displayName || String(state.guestName || '').trim() || '访客';
  state.partySize = partySize;
  try {
    await api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        tableId: table.id,
        guestName,
        guestPhone: state.guestPhone || player?.phone || null,
        partySize,
        playerId: Number.isFinite(reservationPlayerId) ? reservationPlayerId : null,
        reservedStart: localInputToMysqlDatetime(state.startAt),
        reservedEnd: localInputToMysqlDatetime(state.endAt),
      }),
    });
    state.guestName = guestName;
    showToast('预约已创建');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCheckin(reservationId) {
  if (!requireLive()) return;
  try {
    const result = await api(`/api/reservations/${reservationId}/checkin`, { method: 'POST' });
    showToast(`已入场开台，session #${result.sessionId}`);
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onCancel(reservationId) {
  if (!requireLive()) return;
  try {
    await api(`/api/reservations/${reservationId}/cancel`, { method: 'POST' });
    showToast('预约已取消');
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onWalkin() {
  const table = selectedTable();
  if (!table || !requireLive()) return;
  const partySize = normalizedPartySize(state.partySize);
  if (!assertTableCapacity(table, partySize)) return;
  try {
    const result = await api('/api/sessions/walkin', {
      method: 'POST',
      body: JSON.stringify({
        tableId: table.id,
        guestName: String(state.guestName || '').trim() || '现场客人',
        guestPhone: String(state.guestPhone || '').trim() || null,
        partySize,
      }),
    });
    showToast(`现场开台成功，session #${result.sessionId}`);
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onSettle() {
  const openSession = openOnSelected();
  if (!openSession || !requireLive()) return;
  try {
    const amountCents = Math.round(Number(state.amountYuan) * 100);
    await api(`/api/sessions/${openSession.id}/settle`, {
      method: 'POST',
      body: JSON.stringify({
        billedMinutes: Number(state.billedMin),
        amountCents: Number.isFinite(amountCents) ? amountCents : 0,
        notes: state.settleNotes || null,
      }),
    });
    showToast(`已结算关台，session #${openSession.id}`);
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

// ---- Game CRUD ----
function openGameModal(gameId) {
  const modal = $('#game-modal');
  const form = document.getElementById('game-form');
  if (!modal || !form) return;
  form.reset();
  document.getElementById('game-edit-id').value = '';

  if (gameId) {
    document.getElementById('game-modal-title').textContent = '编辑桌游';
    // Fetch game details
    const token = window.localStorage.getItem(AUTH_KEY)||'';
    fetch(`/api/games-mgmt/${gameId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(g => {
        document.getElementById('game-edit-id').value = g.id;
        document.getElementById('game-title').value = g.title||'';
        document.getElementById('game-category').value = g.category||'';
        document.getElementById('game-cover').value = g.coverImageUrl||'';
        document.getElementById('game-desc').value = g.description||'';
        document.getElementById('game-publisher').value = g.publisher||'';
        document.getElementById('game-year').value = g.publishYear||'';
        document.getElementById('game-bggid').value = g.bggId||'';
        form.querySelector('[name="minPlayers"]').value = g.minPlayers||2;
        form.querySelector('[name="maxPlayers"]').value = g.maxPlayers||6;
        form.querySelector('[name="difficulty"]').value = g.difficulty||3;
        form.querySelector('[name="avgMinutes"]').value = g.avgMinutes||90;
      })
      .catch(() => showToast('加载游戏信息失败', 'err'));
  } else {
    document.getElementById('game-modal-title').textContent = '添加桌游';
  }
  modal.style.display = 'flex';
}

function closeGameModal() { $('#game-modal').style.display = 'none'; }

async function onGenerateDescription() {
  const form = document.getElementById('game-form');
  if (!form) return;
  const fd = new FormData(form);
  const title = fd.get('title')?.toString().trim();
  if (!title) { showToast('请先填写桌游名称', 'err'); return; }
  const btn = $('#btn-ai-desc');
  const descEl = document.getElementById('game-desc');
  if (btn) { btn.disabled = true; btn.textContent = '✨ 生成中…'; }
  try {
    const result = await api('/api/ai/game-description', {
      method: 'POST',
      body: JSON.stringify({
        title,
        category: fd.get('category')?.toString().trim() || null,
        minPlayers: Number(fd.get('minPlayers')) || null,
        maxPlayers: Number(fd.get('maxPlayers')) || null,
        avgMinutes: Number(fd.get('avgMinutes')) || null,
        difficulty: Number(fd.get('difficulty')) || null,
      }),
    });
    if (descEl) descEl.value = result.description || '';
    showToast(result.mock ? '已生成示例描述（未配置大模型）' : 'AI 描述已生成');
  } catch (e) {
    showToast(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ AI 生成'; }
  }
}

async function onSaveGame() {
  const form = document.getElementById('game-form');
  if (!form) return;
  const fd = new FormData(form);
  const id = fd.get('id');
  const payload = {
    title: fd.get('title')?.toString().trim(),
    category: fd.get('category')?.toString().trim()||'综合',
    minPlayers: Number(fd.get('minPlayers'))||2,
    maxPlayers: Number(fd.get('maxPlayers'))||6,
    difficulty: Number(fd.get('difficulty'))||3,
    avgMinutes: Number(fd.get('avgMinutes'))||90,
    coverImageUrl: fd.get('coverImageUrl')?.toString().trim()||null,
    description: fd.get('description')?.toString().trim()||null,
    publisher: fd.get('publisher')?.toString().trim()||null,
    publishYear: Number(fd.get('publishYear'))||null,
    bggId: fd.get('bggId')?.toString().trim()||null,
  };
  if (!payload.title) { showToast('请输入桌游名称', 'err'); return; }

  try {
    if (id) {
      await api(`/api/games-mgmt/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/api/games-mgmt/create', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast(id ? '桌游已更新' : '桌游已添加');
    closeGameModal();
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onDeleteGame(gameId) {
  if (!confirm('确定要删除这个桌游吗？此操作不可撤销。')) return;
  try {
    await api(`/api/games-mgmt/${gameId}`, { method: 'DELETE' });
    showToast('桌游已删除');
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

// ---- Staff Management (Phase 2) ----
function openStaffAccountModal(userId) {
  const form = document.getElementById('staff-form');
  const modal = $('#staff-modal');
  if (!form || !modal) return;
  form.reset();
  const staff = userId ? state.staff.find((item) => Number(item.id) === Number(userId)) : null;
  document.getElementById('staff-edit-id').value = staff?.id || '';
  document.getElementById('staff-modal-title').textContent = staff ? '编辑员工' : '添加员工';
  document.getElementById('staff-password-hint').textContent = staff ? '（可选）' : '*';
  document.getElementById('staff-username').disabled = Boolean(staff);
  document.getElementById('staff-username').value = staff?.username || '';
  document.getElementById('staff-display-name').value = staff?.displayName || staff?.fullName || '';
  document.getElementById('staff-full-name').value = staff?.fullName || staff?.displayName || '';
  document.getElementById('staff-phone').value = staff?.phone || '';
  document.getElementById('staff-position').value = staff?.position || (staff?.role === 'admin' ? '店长' : '店员');
  document.getElementById('staff-role').value = staff?.role || 'staff';
  document.getElementById('staff-password').value = '';
  modal.style.display = 'flex';
}

function closeStaffAccountModal() {
  const modal = $('#staff-modal');
  if (modal) modal.style.display = 'none';
}

async function onSaveStaffAccount() {
  const form = document.getElementById('staff-form');
  if (!form) return;
  const fd = new FormData(form);
  const id = fd.get('id')?.toString();
  const payload = {
    username: fd.get('username')?.toString().trim(),
    displayName: fd.get('displayName')?.toString().trim(),
    role: fd.get('role')?.toString()||'staff',
    fullName: fd.get('fullName')?.toString().trim()||null,
    position: fd.get('position')?.toString().trim()||'店员',
    phone: fd.get('phone')?.toString().trim()||null,
  };
  const password = fd.get('password')?.toString() || '';
  if (password) payload.password = password;
  if (!payload.displayName) { showToast('请填写显示名称', 'err'); return; }
  if (!id && !payload.username) { showToast('请填写登录账号', 'err'); return; }
  if (!id && !password) { showToast('请填写初始密码', 'err'); return; }
  if (password && password.length < 8) { showToast('密码至少8位', 'err'); return; }

  try {
    if (id) {
      delete payload.username;
      if (Number(id) === Number(state.currentUser?.id)) delete payload.role;
      await api(`/api/staff-mgmt/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('员工信息已更新');
    } else {
      await api('/api/staff-mgmt/create', { method: 'POST', body: JSON.stringify(payload) });
      showToast('员工账号已创建');
    }
    closeStaffAccountModal();
    form.reset();
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onToggleStaffRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'staff' : 'admin';
  try {
    await api(`/api/staff-mgmt/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
    showToast(`权限已切换为 ${newRole==='admin'?'店长':'员工'}`);
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onToggleStaffStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
  try {
    await api(`/api/staff-mgmt/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    showToast(`账号已${newStatus==='active'?'启用':'禁用'}`);
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

// ---- Coupon CRUD ----
async function onSaveCoupon() {
  const form = document.getElementById('coupon-form');
  if (!form) return;
  const fd = new FormData(form);
  const name = fd.get('name')?.toString().trim();
  const type = fd.get('type');
  const value = Number(fd.get('value'));
  const minAmount = Number(fd.get('minAmount')) || 0;
  const totalQty = Number(fd.get('totalQty'));
  const startAt = fd.get('startAt');
  const endAt = fd.get('endAt');

  if (!name || !type || !value || !totalQty || !startAt || !endAt) { showToast('请填写完整信息', 'err'); return; }
  try {
    await api('/api/coupons-mgmt/create', { method: 'POST', body: JSON.stringify({ name, type, value, minAmount, totalQty, startAt, endAt }) });
    showToast('优惠券创建成功');
    $('#coupon-modal').style.display = 'none';
    form.reset();
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

// ---- Rental actions ----
async function populateLoanCopies() {
  const sel = document.getElementById('loan-copy-select');
  if (!sel) return;
  const gameId = state.rentalLoanGameId;
  if (!gameId) { sel.innerHTML = '<option value="">请先选择桌游</option>'; return; }
  try {
    const token = window.localStorage.getItem(AUTH_KEY) || '';
    const res = await fetch(`/api/rental/copies?gameId=${gameId}`, { headers: { Authorization: `Bearer ${token}` } });
    const copies = ((await res.json()).data || []).filter((c) => c.status === 'available');
    sel.innerHTML = copies.length
      ? copies.map((c) => `<option value="${c.id}">${escapeHtml(c.barcode || '副本 #' + c.id)}${c.location ? ' · ' + escapeHtml(c.location) : ''}</option>`).join('')
      : '<option value="">该桌游暂无可借副本</option>';
    state.rentalLoanCopyId = copies[0]?.id || '';
  } catch (e) { sel.innerHTML = '<option value="">加载失败</option>'; }
}

async function onSaveLoan() {
  if (!requireLive()) return;
  const copyId = Number(state.rentalLoanCopyId);
  if (!copyId) { showToast('请选择可借副本', 'err'); return; }
  try {
    await api('/api/rental/loans', {
      method: 'POST',
      body: JSON.stringify({
        copyId,
        playerId: state.rentalLoanPlayerId ? Number(state.rentalLoanPlayerId) : null,
        dueAt: state.rentalLoanDueAt ? localInputToMysqlDatetime(state.rentalLoanDueAt) : null,
        depositCents: Math.round(Number(state.rentalLoanDeposit || 0) * 100),
      }),
    });
    showToast('借出登记成功');
    $('#loan-modal').style.display = 'none';
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onReturnLoan(loanId, markLost) {
  if (!requireLive()) return;
  if (markLost && !window.confirm('确定标记为丢失吗？该副本将不可借出。')) return;
  try {
    const result = await api(`/api/rental/loans/${loanId}/return`, {
      method: 'POST',
      body: JSON.stringify({ markLost }),
    });
    showToast(markLost ? '已标记丢失' : result?.overdue ? '已归还（此前已逾期）' : '已归还');
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onSaveCopy() {
  if (!requireLive()) return;
  const gameId = Number(state.rentalNewCopyGameId);
  if (!gameId) { showToast('请选择桌游', 'err'); return; }
  try {
    await api('/api/rental/copies', {
      method: 'POST',
      body: JSON.stringify({
        gameId,
        barcode: state.rentalNewCopyBarcode || null,
        location: state.rentalNewCopyLocation || null,
        depositCents: Math.round(Number(state.rentalNewCopyDeposit || 0) * 100),
      }),
    });
    showToast('副本已新增');
    $('#copy-modal').style.display = 'none';
    state.rentalNewCopyBarcode = '';
    state.rentalNewCopyLocation = '';
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onDeleteCopy(copyId) {
  if (!requireLive()) return;
  if (!window.confirm('确定删除该副本吗？')) return;
  try {
    await api(`/api/rental/copies/${copyId}`, { method: 'DELETE' });
    showToast('副本已删除');
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onAiSend() {
  const question = String(state.aiInput || '').trim();
  if (!question || state.aiLoading) return;
  state.aiMessages.push({ role: 'user', content: question });
  state.aiInput = '';
  state.aiLoading = true;
  render();
  try {
    const result = await api('/api/ai/agent', { method: 'POST', body: JSON.stringify({ message: question, scope: state.activePage || 'dashboard' }) });
    state.aiCards = result.cards || state.aiCards;
    state.aiActions = result.actions || state.aiActions;
    state.aiToolResults = result.toolResults || state.aiToolResults;
    state.aiMessages.push({ role: 'assistant', content: result.answer || '（无回答）' });
    if (result.mock) showToast('演示回答（未配置大模型）');
  } catch (e) {
    state.aiMessages.push({ role: 'assistant', content: `出错了：${e.message}` });
  } finally {
    state.aiLoading = false;
    render();
  }
}

async function onPetSend() {
  const question = String(state.petInput || '').trim();
  if (!question || state.petLoading) return;
  state.petMessages.push({ role: 'user', content: question });
  state.petInput = '';
  state.petLoading = true;
  render();
  try {
    const result = await api('/api/ai/agent', { method: 'POST', body: JSON.stringify({ message: question, scope: state.activePage || 'dashboard' }) });
    state.aiCards = result.cards || state.aiCards;
    state.aiActions = result.actions || state.aiActions;
    state.aiToolResults = result.toolResults || state.aiToolResults;
    state.petMessages.push({ role: 'assistant', content: result.answer || '（无回答）' });
  } catch (e) {
    state.petMessages.push({ role: 'assistant', content: `喵呜…出错了：${e.message}` });
  } finally {
    state.petLoading = false;
    render();
  }
}

async function onCustChatSend() {
  const message = String(state.custChatInput || '').trim();
  if (!message || state.custChatLoading) return;
  state.custChatMessages.push({ role: 'user', content: message });
  state.custChatInput = '';
  state.custChatLoading = true;
  render();
  try {
    const result = await api('/api/public/ai/guide', {
      method: 'POST',
      body: JSON.stringify({
        message,
        partySize: state.customerPartySize,
        startAt: localInputToMysqlDatetime(state.customerStartAt),
        endAt: localInputToMysqlDatetime(state.customerEndAt),
        preferences: message,
      }),
    });
    state.customerGuideGames = result.recommendedGames || [];
    state.customerGuideTables = result.availableTables || [];
    state.custChatMessages.push({ role: 'assistant', content: result.reply || '（无回答）', sources: result.sources || [] });
  } catch (e) {
    state.custChatMessages.push({ role: 'assistant', content: `抱歉，出错了：${e.message}` });
  } finally {
    state.custChatLoading = false;
    render();
  }
}

async function loadPublicData() {
  const [games, venue, leaderboard, rentals] = await Promise.allSettled([
    api('/api/games'),
    api('/api/venue'),
    api('/api/leaderboard?sortBy=elo'),
    api('/api/public/rental/games'),
  ]);
  const failures = [];
  if (games.status === 'fulfilled' && Array.isArray(games.value)) state.games = games.value;
  else failures.push('桌游目录');
  if (venue.status === 'fulfilled' && venue.value) state.venue = venue.value;
  else failures.push('门店信息');
  if (leaderboard.status === 'fulfilled' && Array.isArray(leaderboard.value)) state.leaderboard = leaderboard.value;
  else failures.push('排行榜');
  if (rentals.status === 'fulfilled') state.publicRentalGames = rentals.value?.data || [];
  else failures.push('租借清单');
  state.err = failures.length ? `部分内容暂不可用：${failures.join('、')}。预约功能可继续使用。` : '';
  if (state.customerToken) await loadCustomerProfile();
}

async function init() {
  if (!window.location.hash && isAdminPath()) {
    window.history.replaceState(null, '', `${ADMIN_PATH}#/dashboard`);
  }
  state.activePage = pageFromHash();
  if (!isAdminPath() && navigateIds.has(state.activePage)) {
    window.location.replace(`${ADMIN_PATH}#/${state.activePage}`);
    return;
  }
  if (isAdminPath() && state.activePage === 'customer') {
    window.location.replace('/');
    return;
  }
  if (!state.authToken) {
    if (state.activePage === 'customer') await loadPublicData();
    render();
    return;
  }
  try {
    const result = await api('/api/auth/me');
    if (result.user) {
      state.currentUser = result.user;
      if (state.activePage === 'customer') {
        await loadPublicData();
        await render();
      } else {
        await refresh();
      }
      ensureRefreshTimer();
      return;
    }
  } catch {
    setAuth('', null);
  }
  render();
}

window.addEventListener('hashchange', () => {
  const nextPage = pageFromHash();
  if (state.activePage === nextPage) return;
  if (!isAdminPath() && navigateIds.has(nextPage)) {
    window.location.replace(`${ADMIN_PATH}#/${nextPage}`);
    return;
  }
  if (isAdminPath() && nextPage === 'customer') {
    window.location.replace('/');
    return;
  }
  state.activePage = nextPage;
  if (nextPage === 'customer') {
    void loadPublicData().then(render);
  }
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
});

init();

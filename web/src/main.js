const $ = (selector, root = document) => root.querySelector(selector);
const AUTH_KEY = 'boardgame.auth.token';
const ALLOW_PUBLIC_REGISTER = import.meta.env.VITE_ALLOW_PUBLIC_REGISTER === '1';
let refreshTimer = null;

const statusText = {
  idle: '空闲',
  reserved: '已预约',
  occupied: '占用中',
};

const navItems = [
  {
    id: 'dashboard',
    label: '运营总览',
    icon: 'overview',
    eyebrow: 'Operations',
    title: '门店运营总览',
    description: '集中查看今日预约、开台状态、收入、热门桌游和待处理事项。',
  },
  {
    id: 'tables',
    label: '桌位预约',
    icon: 'floor',
    eyebrow: 'Table Flow',
    title: '桌位预约与入场',
    description: '按桌位处理预约、新建预约、入场、取消和现场开台。',
  },
  {
    id: 'members',
    label: '会员管理',
    icon: 'members',
    eyebrow: 'Members',
    title: '会员资料与储值',
    description: '管理会员档案、余额、充值、扣费和会员状态。',
  },
  {
    id: 'staff',
    label: '员工管理',
    icon: 'staff',
    eyebrow: 'Staff',
    title: '员工档案与后台账号',
    description: '管理员工工号、岗位、联系方式和后台登录账号。',
  },
  {
    id: 'recommend',
    label: '智能推荐',
    icon: 'recommend',
    eyebrow: 'Recommendation',
    title: '智能桌游与桌位推荐',
    description: '根据人数、时长、会员偏好和预约时段生成可解释推荐。',
  },
  {
    id: 'sessions',
    label: '对局战绩',
    icon: 'workflow',
    eyebrow: 'Sessions',
    title: '对局、结算与战绩',
    description: '查看待处理预约、进行中对局和会员战绩排行。',
  },
  {
    id: 'reports',
    label: '数据报表',
    icon: 'records',
    eyebrow: 'Reports',
    title: '收入与运营报表',
    description: '查看今日收入、桌位利用率和桌游热度排行。',
  },
  {
    id: 'games',
    label: '桌游目录',
    icon: 'records',
    eyebrow: 'Game Catalog',
    title: '桌游目录管理',
    description: '浏览、添加和编辑桌游信息与描述。',
  },
  {
    id: 'staff-mgmt',
    label: '权限管理',
    icon: 'staff',
    eyebrow: 'Admin',
    title: '员工与权限管理',
    description: '管理员工账号、角色权限和启用状态。需要管理员权限。',
  },
];

const publicPageIds = new Set(['customer']);
const navigateIds = new Set([...navItems.map((item) => item.id)]);
const pageIds = new Set([...navigateIds, ...publicPageIds]);

function pageFromHash() {
  const key = window.location.hash.replace(/^#\/?/, '').trim() || 'dashboard';
  return pageIds.has(key) ? key : 'dashboard';
}

function currentPageMeta() {
  return navItems.find((item) => item.id === state.activePage) || navItems[0];
}

const demoData = {
  venue: {
    id: 1,
    name: '骰子猫桌游馆',
    address: '银杏路 18 号 2F',
    logoUrl: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=720&q=80',
  },
  tables: [
    { id: 1, code: 'A01', posX: 0, posY: 0, status: 'idle' },
    { id: 2, code: 'A02', posX: 1, posY: 0, status: 'reserved' },
    { id: 3, code: 'A03', posX: 2, posY: 0, status: 'occupied' },
    { id: 4, code: 'A04', posX: 3, posY: 0, status: 'idle' },
    { id: 5, code: 'B01', posX: 0, posY: 1, status: 'reserved' },
    { id: 6, code: 'B02', posX: 1, posY: 1, status: 'idle' },
    { id: 7, code: 'B03', posX: 2, posY: 1, status: 'occupied' },
    { id: 8, code: 'B04', posX: 3, posY: 1, status: 'idle' },
    { id: 9, code: 'C01', posX: 0, posY: 2, status: 'idle' },
    { id: 10, code: 'C02', posX: 1, posY: 2, status: 'reserved' },
    { id: 11, code: 'C03', posX: 2, posY: 2, status: 'idle' },
    { id: 12, code: 'C04', posX: 3, posY: 2, status: 'occupied' },
  ],
  players: [
    { id: 1, memberNo: 'MB202600001', displayName: '林鹿', phone: '13800010001', avatarUrl: 'https://i.pravatar.cc/128?img=11', balanceCents: 26800, totalRechargedCents: 60000, totalSpentCents: 33200, status: 'active' },
    { id: 2, memberNo: 'MB202600002', displayName: '阿哲', phone: '13800010002', avatarUrl: 'https://i.pravatar.cc/128?img=12', balanceCents: 12600, totalRechargedCents: 40000, totalSpentCents: 27400, status: 'active' },
    { id: 3, memberNo: 'MB202600003', displayName: 'Momo', phone: '13800010003', avatarUrl: 'https://i.pravatar.cc/128?img=13', balanceCents: 35600, totalRechargedCents: 80000, totalSpentCents: 44400, status: 'active' },
    { id: 4, memberNo: 'MB202600004', displayName: '老周', phone: '13800010004', avatarUrl: 'https://i.pravatar.cc/128?img=14', balanceCents: 5800, totalRechargedCents: 30000, totalSpentCents: 24200, status: 'active' },
  ],
  staff: [
    { id: 1, employeeNo: 'ST20260001', fullName: '门店管理员', phone: '13800009001', position: '店长', status: 'active', username: 'admin', role: 'admin', userStatus: 'active' },
    { id: 2, employeeNo: 'ST20260002', fullName: '值班店员', phone: '13800009002', position: '店员', status: 'active', username: null, role: null, userStatus: null },
  ],
  games: [
    { id: 1, title: '卡坦岛', coverImageUrl: 'https://cf.geekdo-images.com/W3Bsga_uLP9kO91gZ7H8yw__original/img/xV7oisd3RQ8R-k18cdWAYthHXsA=/0x0/filters:format(jpeg)/pic2419375.jpg', minPlayers: 3, maxPlayers: 4, category: '策略', difficultyLevel: 3, avgMinutes: 90 },
    { id: 2, title: '璀璨宝石', coverImageUrl: 'https://cf.geekdo-images.com/vNFe4JkhKAERzi4T0Ntwpw__original/img/0E9xIYlYZCWeIYbXd8y2lyctUDo=/0x0/filters:format(jpeg)/pic1904079.jpg', minPlayers: 2, maxPlayers: 4, category: '家庭', difficultyLevel: 2, avgMinutes: 35 },
    { id: 3, title: '阿瓦隆', coverImageUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', minPlayers: 5, maxPlayers: 10, category: '推理', difficultyLevel: 2, avgMinutes: 45 },
  ],
  reservations: [
    { id: 101, tableId: 2, tableCode: 'A02', playerId: 1, guestName: '周末小队', playerName: '林鹿', playerPhone: '13800010001', partySize: 4, status: 'pending', reservedStart: new Date(Date.now() + 1800000).toISOString(), reservedEnd: new Date(Date.now() + 9000000).toISOString() },
    { id: 102, tableId: 5, tableCode: 'B01', playerId: 2, guestName: '四人局', playerName: '阿哲', playerPhone: '13800010002', partySize: 4, status: 'pending', reservedStart: new Date(Date.now() + 3600000).toISOString(), reservedEnd: new Date(Date.now() + 10800000).toISOString() },
    { id: 103, tableId: 10, tableCode: 'C02', playerId: 3, guestName: 'Momo', playerName: 'Momo', playerPhone: '13800010003', partySize: 5, status: 'pending', reservedStart: new Date(Date.now() + 7200000).toISOString(), reservedEnd: new Date(Date.now() + 14400000).toISOString() },
  ],
  openSessions: [
    { id: 301, tableId: 3, tableCode: 'A03', guestName: '林鹿小队', guestPhone: '13800010001', partySize: 4, startedAt: new Date(Date.now() - 3900000).toISOString() },
    { id: 302, tableId: 7, tableCode: 'B03', guestName: '现场三人局', guestPhone: '13900020002', partySize: 3, startedAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 303, tableId: 12, tableCode: 'C04', guestName: '包间推理局', guestPhone: '13900020003', partySize: 6, startedAt: new Date(Date.now() - 5400000).toISOString() },
  ],
  leaderboard: [
    { playerId: 1, displayName: '林鹿', wins: 18, games: 25, winRate: '0.72' },
    { playerId: 2, displayName: '阿哲', wins: 15, games: 24, winRate: '0.625' },
    { playerId: 3, displayName: 'Momo', wins: 12, games: 22, winRate: '0.545' },
  ],
  revenue: { revenue_yuan: 1380, settled_sessions: 18 },
  popularity: [
    { title: '璀璨宝石', record_count: 28 },
    { title: '阿瓦隆', record_count: 21 },
    { title: '卡坦岛', record_count: 17 },
  ],
  tableUtilization: [
    { code: 'A03', settled_sessions_in_range: 18 },
    { code: 'B03', settled_sessions_in_range: 15 },
    { code: 'C04', settled_sessions_in_range: 13 },
    { code: 'A01', settled_sessions_in_range: 11 },
  ],
  gameRecommendations: [
    { gameId: 1, title: '卡坦岛', coverImageUrl: 'https://cf.geekdo-images.com/W3Bsga_uLP9kO91gZ7H8yw__original/img/xV7oisd3RQ8R-k18cdWAYthHXsA=/0x0/filters:format(jpeg)/pic2419375.jpg', minPlayers: 3, maxPlayers: 4, category: '策略', difficultyLevel: 3, avgMinutes: 90, score: 88.5, reason: '适合 4 人，时长接近 120 分钟，近期热度较高。' },
    { gameId: 2, title: '璀璨宝石', coverImageUrl: 'https://cf.geekdo-images.com/vNFe4JkhKAERzi4T0Ntwpw__original/img/0E9xIYlYZCWeIYbXd8y2lyctUDo=/0x0/filters:format(jpeg)/pic1904079.jpg', minPlayers: 2, maxPlayers: 4, category: '家庭', difficultyLevel: 2, avgMinutes: 35, score: 82.2, reason: '适合 4 人，规则轻量，适合快速热身。' },
    { gameId: 3, title: '阿瓦隆', coverImageUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80', minPlayers: 5, maxPlayers: 10, category: '推理', difficultyLevel: 2, avgMinutes: 45, score: 76.4, reason: '近期热度较高，适合聚会推理偏好。' },
  ],
  tableRecommendations: [
    { tableId: 1, code: 'A01', seatCapacity: 4, areaType: 'standard', status: 'idle', score: 94, reason: '容量适合 4 人，当前空闲，近期使用较均衡。' },
    { tableId: 8, code: 'B04', seatCapacity: 4, areaType: 'standard', status: 'idle', score: 90, reason: '容量适合 4 人，当前空闲。' },
  ],
};

const state = {
  tables: [],
  players: [],
  members: [],
  staff: [],
  games: [],
  gameRecommendations: [],
  tableRecommendations: [],
  reservations: [],
  openSessions: [],
  leaderboard: [],
  popularity: [],
  tableUtilization: [],
  revenue: null,
  venue: null,
  memberReservations: [],
  memberReservationMemberId: null,
  memberReservationsLoading: false,
  selectedId: null,
  selectedMemberId: null,
  selectedStaffId: null,
  activePage: pageFromHash(),
  authToken: window.localStorage.getItem(AUTH_KEY) || '',
  currentUser: null,
  authMode: 'login',
  loginUsername: 'admin',
  loginPassword: '',
  registerUsername: '',
  registerDisplayName: '',
  registerPassword: '',
  health: '正在连接',
  mode: 'loading',
  err: '',
  guestName: '访客',
  guestPhone: '',
  playerId: '',
  partySize: 4,
  startAt: toLocalInputValue(new Date()),
  endAt: toLocalInputValue(addHours(new Date(), 2)),
  tableMatchUpdatedAt: '',
  billedMin: 90,
  amountYuan: '48',
  settleNotes: '',
  gameId: '1',
  winnerId: '',
  closedSessionId: '',
  memberSearch: '',
  staffSearch: '',
  gameSearch: '',
  newMemberName: '',
  newMemberPhone: '',
  newMemberBalance: '100',
  memberAmount: '100',
  newStaffName: '',
  newStaffPhone: '',
  newStaffPosition: '店员',
  editStaffName: '',
  editStaffPhone: '',
  editStaffPosition: '',
  staffAccountUsername: '',
  staffAccountPassword: '',
  staffAccountRole: 'staff',
  recommendPlayerId: '',
  recommendPartySize: 4,
  recommendMinutes: 120,
  recommendCategory: '',
  recommendationUpdatedAt: '',
  customerGuestName: '',
  customerPhone: '',
  customerPartySize: 4,
  customerStartAt: toLocalInputValue(addHours(new Date(), 1)),
  customerEndAt: toLocalInputValue(addHours(new Date(), 3)),
  customerSelectedTableId: '',
  customerMatches: [],
  customerResult: null,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHours(d, h) {
  return new Date(d.getTime() + h * 3600000);
}

function localInputToMysqlDatetime(dtLocal) {
  const d = new Date(dtLocal);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function yuan(cents) {
  const n = Number(cents || 0) / 100;
  return `¥${n.toFixed(n % 1 ? 2 : 0)}`;
}

function formatTime(value) {
  if (!value) return '未设置';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '未设置';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatTimeRange(start, end) {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function formatDurationFrom(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '进行中';
  const minutes = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function formatWinRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return escapeHtml(value || '0%');
  if (numeric <= 1) return `${Math.round(numeric * 1000) / 10}%`;
  return `${Math.round(numeric * 10) / 10}%`;
}

const clientErrorMessages = {
  unauthorized: '请先登录后再操作',
  forbidden: '当前账号没有执行该操作的权限',
  invalid_credentials: '账号或密码错误',
  registration_disabled: '公开注册已关闭，请联系管理员创建员工账号',
  missing_fields: '缺少必填字段，请补全后再提交',
  invalid_guest_name: '访客名称不能为空',
  invalid_party_size: '人数必须在 1 到 20 人之间',
  invalid_time: '预约时间格式不合法',
  invalid_time_range: '结束时间必须晚于开始时间',
  table_not_found: '桌位不存在',
  table_occupied: '桌位正在占用中，请先选择空闲桌位',
  time_overlap: '该时间段已有预约，请调整时间或选择其他桌位',
  capacity_exceeded: '人数超过该桌位容量，请选择更大桌位或包间',
  reserved_slot_active: '当前时间段已有待入场预约，不能现场开台',
  no_table_available: '当前时间段没有容量合适的空闲桌位',
  reservation_not_found: '预约记录不存在',
  reservation_not_pending: '该预约不是待入场状态，不能入场',
  reservation_not_cancellable: '该预约已入场、取消或完成，不能再取消',
  session_not_open: '该对局不存在或已经结算，不能重复关台',
  session_still_open: '该对局仍在进行中，请先结算关台再录入战绩',
  game_not_found: '选择的桌游不存在',
  missing_gameId: '请选择要录入的桌游',
  member_not_found: '会员不存在或已停用',
  insufficient_balance: '会员不存在或余额不足',
  invalid_amount: '金额必须大于 0',
  missing_staff_name: '员工姓名不能为空',
  staff_not_found: '员工不存在或已停用',
  employee_no_exists: '员工号已存在',
  staff_has_account: '该员工已经绑定后台账号',
  account_exists: '账号已存在，请换一个账号名',
  database_error: '数据库操作失败，请检查数据库服务是否正常',
};

function readableApiError(body, statusText) {
  const code = body?.error;
  return body?.message || body?.description || clientErrorMessages[code] || code || statusText || '操作失败，请稍后重试';
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
  let response;
  try {
    response = await fetch(path, {
      ...opts,
      headers,
    });
  } catch {
    throw new Error('无法连接后端服务，请确认服务已启动并且数据库可用。');
  }
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = readableApiError(body, response.statusText);
    } catch {
      // keep status text
    }
    if (response.status === 401) {
      state.currentUser = null;
      state.authToken = '';
      window.localStorage.removeItem(AUTH_KEY);
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function setAuth(token, user) {
  state.authToken = token || '';
  state.currentUser = user || null;
  if (state.authToken) window.localStorage.setItem(AUTH_KEY, state.authToken);
  else window.localStorage.removeItem(AUTH_KEY);
}

function ensureRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    if (state.currentUser) void refresh();
  }, 30000);
}

function showToast(message, type = 'ok') {
  const host = $('#toast-host');
  if (!host || !message) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type === 'err' ? 'err' : 'ok'}`;
  toast.textContent = message;
  host.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
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
    const [health, tables, players, members, staff, games, reservations, openSessions, leaderboard, venue, revenue, popularity, tableUtilization] =
      await Promise.all([
        api('/api/health'),
        api('/api/tables'),
        api('/api/players'),
        api(`/api/members?q=${encodeURIComponent(state.memberSearch)}`),
        api(`/api/staff?q=${encodeURIComponent(state.staffSearch)}`),
        api('/api/games'),
        api('/api/reservations'),
        api('/api/sessions/open'),
        api('/api/leaderboard'),
        api('/api/venue'),
        api(`/api/reports/revenue?date=${today}`),
        api('/api/reports/game-popularity?days=30'),
        api('/api/reports/table-utilization?days=30'),
      ]);

    Object.assign(state, {
      tables,
      players,
      members,
      staff,
      games,
      reservations,
      openSessions,
      leaderboard,
      venue,
      revenue,
      popularity,
      tableUtilization,
      health: health?.db ? '数据库已连接' : 'API 可用',
      mode: 'live',
      err: '',
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
    if (staff.length) {
      const selectedStaffVisible = staff.some((item) => Number(item.id) === Number(state.selectedStaffId));
      if (!state.selectedStaffId || !selectedStaffVisible) state.selectedStaffId = staff[0].id;
    } else {
      state.selectedStaffId = null;
    }
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

function reservationsForTable(tableId) {
  return state.reservations
    .filter((reservation) => reservation.tableId === tableId && reservation.status === 'pending')
    .slice()
    .sort((a, b) => {
      const timeDiff = new Date(a.reservedStart).getTime() - new Date(b.reservedStart).getTime();
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
    ['空闲桌位', summary.idle, '可立即接待', 'ok'],
    ['预约中', summary.reserved, '等待入场', 'warn'],
    ['占用中', summary.occupied, '正在计时', 'danger'],
    ['活跃会员', summary.members, `余额合计 ${yuan(state.members.reduce((sum, m) => sum + Number(m.balanceCents || 0), 0))}`, 'blue'],
  ]
    .map(
      ([label, value, hint, tone]) => `
        <section class="metric metric--${tone}">
          <span class="metric-label">${label}</span>
          <strong class="metric-value">${value}</strong>
          <span class="metric-hint">${hint}</span>
        </section>`
    )
    .join('');
}

function renderFloor() {
  const dims = gridDims();
  return `
    <div class="floor-toolbar">
      <div>
        <h2>桌位平面图</h2>
        <p>${state.venue?.address ? escapeHtml(state.venue.address) : '根据实时状态安排预约、入场和结算'}</p>
      </div>
      <div class="legend" aria-label="桌位状态图例">
        <span><i class="swatch swatch--idle"></i>空闲</span>
        <span><i class="swatch swatch--reserved"></i>预约</span>
        <span><i class="swatch swatch--occupied"></i>占用</span>
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
      <div class="match-hint">预约超过开始时间 15 分钟仍未入场时，系统会自动标记为未到店并释放桌位；员工也可以在队列中手动取消迟到预约。</div>
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

  return `
    <section class="table-detail-section current-use-card">
      <div class="mini-section-head"><strong>正在使用</strong><span>session #${openSession.id}</span></div>
      <div class="reservation-detail-grid">
        <div><span>使用人</span><strong>${escapeHtml(sessionDisplayName(openSession))}</strong></div>
        <div><span>联系电话</span><strong>${escapeHtml(sessionPhone(openSession))}</strong></div>
        <div><span>人数</span><strong>${sessionPartySize(openSession)} 人</strong></div>
        <div><span>来源</span><strong>${openSession.reservationId ? `预约 #${openSession.reservationId}` : '现场开台'}</strong></div>
        <div><span>开台时间</span><strong>${escapeHtml(formatDateTime(openSession.startedAt))}</strong></div>
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
      <h3>结算与战绩</h3>
      ${
        openSession
          ? `<div class="session-banner"><strong>对局 #${openSession.id}</strong><span>已进行 ${formatDurationFrom(openSession.startedAt)}</span></div>
            <label class="field"><span>计费时长（分钟）</span><input class="input" type="number" min="1" data-field="billedMin" value="${escapeAttr(state.billedMin)}" /></label>
            <label class="field"><span>金额（元）</span><input class="input" inputmode="decimal" data-field="amountYuan" value="${escapeAttr(state.amountYuan)}" /></label>
            <label class="field"><span>备注</span><textarea class="input textarea" data-field="settleNotes">${escapeHtml(state.settleNotes)}</textarea></label>
            <button class="btn btn-danger full" data-settle type="button">结算关台</button>`
          : `<div class="empty-state compact">当前桌位暂无进行中的对局。</div>`
      }
      <label class="field"><span>已结算 sessionId</span><input class="input" data-field="closedSessionId" value="${escapeAttr(state.closedSessionId)}" placeholder="结算后自动填入" /></label>
      <label class="field">
        <span>游戏</span>
        <select class="input" data-field="gameId">
          ${state.games.map((g) => `<option value="${g.id}" ${String(state.gameId) === String(g.id) ? 'selected' : ''}>${escapeHtml(g.title)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>胜者</span>
        <select class="input" data-field="winnerId">
          <option value="">访客或无胜者</option>
          ${state.players.map((p) => `<option value="${p.id}" ${String(state.winnerId) === String(p.id) ? 'selected' : ''}>${escapeHtml(p.displayName)}</option>`).join('')}
        </select>
      </label>
      <button class="btn btn-secondary full" data-record type="button">写入战绩</button>
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
      <div class="section-head">
        <div>
          <h2>会员管理</h2>
          <span>查看资料、新增会员、充值、扣费和停用会员</span>
        </div>
        <label class="member-search">
          <span>搜索</span>
          <input class="input" data-field="memberSearch" placeholder="姓名 / 手机 / 会员号" value="${escapeAttr(state.memberSearch)}" />
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
      <div class="section-head">
        <div>
          <h2>员工管理</h2>
          <span>员工号是门店业务身份；后台账号只负责登录和权限。</span>
        </div>
        <label class="member-search">
          <span>搜索</span>
          <input class="input" data-field="staffSearch" placeholder="姓名 / 手机 / 员工号 / 账号" value="${escapeAttr(state.staffSearch)}" />
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

function renderRecommendations() {
  const selected = selectedMember();
  const categoryOptions = [...new Set(state.games.map((game) => game.category).filter(Boolean))];
  const updated = state.recommendationUpdatedAt ? `最近生成 ${formatTime(state.recommendationUpdatedAt)}` : '基于历史对局与当前预约条件';
  const gameCards = state.gameRecommendations
    .map(
      (game) => `
        <article class="recommend-card">
          <img src="${escapeAttr(game.coverImageUrl || 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=520&q=80')}" alt="${escapeAttr(game.title)}封面" loading="lazy" />
          <div class="recommend-card-body">
            <div class="recommend-title">
              <strong>${escapeHtml(game.title)}</strong>
              <b>${Number(game.score || 0).toFixed(1)}</b>
            </div>
            <div class="score-bar" aria-label="推荐分数 ${Number(game.score || 0).toFixed(1)}"><i style="width:${scoreWidth(game.score)}"></i></div>
            <p>${escapeHtml(game.reason || '综合匹配人数、时长、会员偏好和近期热度。')}</p>
            <div class="tag-row">
              <span>${escapeHtml(game.category || '综合')}</span>
              <span>${game.minPlayers || 1}-${game.maxPlayers || 8} 人</span>
              <span>${game.avgMinutes || 90} 分钟</span>
              <span>难度 ${game.difficultyLevel || 3}</span>
            </div>
          </div>
        </article>`
    )
    .join('');

  const tableRows = state.tableRecommendations
    .map(
      (table) => `
        <div class="recommend-table-row">
          <div>
            <div class="recommend-title compact">
              <strong>${escapeHtml(table.code)}</strong>
              <b>${Number(table.score || 0).toFixed(1)}</b>
            </div>
            <span>${table.seatCapacity || 4} 人 · ${escapeHtml(areaTypeText(table.areaType))} · ${statusText[table.status] || table.status}</span>
            <p>${escapeHtml(table.reason || '该时段无冲突预约，容量与人数较匹配。')}</p>
          </div>
          <button class="btn btn-secondary btn-sm" data-recommend-table="${table.tableId}" type="button">选中桌位</button>
        </div>`
    )
    .join('');

  return `
    <section class="panel recommend-panel" id="recommend">
      <div class="section-head">
        <div>
          <h2>智能推荐</h2>
          <span>${escapeHtml(updated)}</span>
        </div>
        <button class="btn btn-primary" data-recommend type="button">生成推荐</button>
      </div>
      <div class="recommend-controls">
        <label class="field">
          <span>会员偏好</span>
          <select class="input" data-field="recommendPlayerId">
            <option value="">当前选中会员${selected ? `：${escapeHtml(selected.displayName)}` : ''}</option>
            ${state.players.map((p) => `<option value="${p.id}" ${String(state.recommendPlayerId) === String(p.id) ? 'selected' : ''}>${escapeHtml(p.displayName)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>预约人数</span><input class="input" type="number" min="1" max="20" data-field="recommendPartySize" value="${escapeAttr(state.recommendPartySize)}" /></label>
        <label class="field"><span>预计时长（分钟）</span><input class="input" type="number" min="10" max="600" step="10" data-field="recommendMinutes" value="${escapeAttr(state.recommendMinutes)}" /></label>
        <label class="field">
          <span>偏好类型</span>
          <select class="input" data-field="recommendCategory">
            <option value="">不限类型</option>
            ${categoryOptions.map((category) => `<option value="${escapeAttr(category)}" ${state.recommendCategory === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="recommend-grid">
        <div>
          <div class="mini-section-head"><strong>推荐桌游 Top 5</strong><span>混合评分模型</span></div>
          <div class="recommend-card-list">${gameCards || '<div class="empty-state compact">点击生成推荐后显示桌游结果。</div>'}</div>
        </div>
        <div>
          <div class="mini-section-head"><strong>推荐桌位</strong><span>容量与冲突检测</span></div>
          <div class="recommend-table-list">${tableRows || '<div class="empty-state compact">点击生成推荐后显示可用桌位。</div>'}</div>
        </div>
      </div>
    </section>`;
}

function renderReservations() {
  if (!state.reservations.length) return '<div class="empty-state compact">暂无待处理预约。</div>';
  return state.reservations
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
      (s) => `
        <div class="data-row">
          <div><strong>#${s.id} ${escapeHtml(s.tableCode)}</strong><span>${escapeHtml(sessionDisplayName(s))} · ${sessionPartySize(s)} 人 · 已进行 ${formatDurationFrom(s.startedAt)}</span></div>
          <span class="soft-chip">计时中</span>
        </div>`
    )
    .join('');
}

function renderLeaderboard() {
  if (!state.leaderboard.length) return '<div class="empty-state compact">暂无排行数据。</div>';
  return state.leaderboard
    .slice(0, 6)
    .map(
      (row, index) => `
        <div class="rank-row">
          <span class="rank-no">${index + 1}</span>
          <div><strong>${escapeHtml(row.displayName)}</strong><span>${row.wins} 胜 / ${row.games} 局</span></div>
          <b>${formatWinRate(row.winRate)}</b>
        </div>`
    )
    .join('');
}

function renderGameCatalog() {
  return state.games
    .slice(0, 6)
    .map((game) => {
      const popularity = state.popularity.find((row) => row.title === game.title || row.game_title === game.title);
      const plays = popularity?.record_count ?? popularity?.plays ?? popularity?.play_count ?? popularity?.sessions ?? 0;
      return `
        <article class="game-card">
          <img src="${escapeAttr(game.coverImageUrl || 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80')}" alt="${escapeAttr(game.title)}封面" loading="lazy" />
          <div><strong>${escapeHtml(game.title)}</strong><span>${game.minPlayers || 2}-${game.maxPlayers || 8} 人 · 近 30 天 ${plays} 次</span></div>
        </article>`;
    })
    .join('');
}

function renderAuthScreen() {
  const isRegister = ALLOW_PUBLIC_REGISTER && state.authMode === 'register';
  return `
    <div class="auth-shell">
      <section class="auth-visual">
        <div>
          <span class="eyebrow">Dice Cat Ops</span>
          <h1>桌游门店运营工作台</h1>
          <p>预约、桌位、会员、结算和战绩在同一个后台完成。</p>
        </div>
      </section>
      <section class="auth-panel" aria-label="${isRegister ? '注册账号' : '登录账号'}">
        <div class="auth-card">
          <div class="auth-head">
            <span class="eyebrow">${isRegister ? 'Create Account' : 'Staff Login'}</span>
            <h2>${isRegister ? '注册员工账号' : '登录后台'}</h2>
          </div>
          ${
            ALLOW_PUBLIC_REGISTER
              ? `<div class="auth-tabs">
                   <button class="${!isRegister ? 'is-active' : ''}" data-auth-mode="login" type="button">登录</button>
                   <button class="${isRegister ? 'is-active' : ''}" data-auth-mode="register" type="button">注册</button>
                 </div>`
              : ''
          }
          ${
            isRegister
              ? `<form class="auth-form">
                  <label class="field"><span>账号</span><input class="input" data-field="registerUsername" autocomplete="username" value="${escapeAttr(state.registerUsername)}" /></label>
                  <label class="field"><span>显示名称</span><input class="input" data-field="registerDisplayName" autocomplete="name" value="${escapeAttr(state.registerDisplayName)}" /></label>
                  <label class="field"><span>密码</span><input class="input" type="password" data-field="registerPassword" autocomplete="new-password" /></label>
                  <button class="btn btn-primary full" data-register type="button">注册并进入</button>
                </form>`
              : `<form class="auth-form">
                  <label class="field"><span>账号</span><input class="input" data-field="loginUsername" autocomplete="username" value="${escapeAttr(state.loginUsername)}" /></label>
                  <label class="field"><span>密码</span><input class="input" type="password" data-field="loginPassword" autocomplete="current-password" /></label>
                  <button class="btn btn-primary full" data-login type="button">登录</button>
                </form>`
          }
        </div>
      </section>
    </div>
    <div id="toast-host" class="toast-host"></div>`;
}

function renderNav() {
  return navItems
    .map(
      (item) => `
        <a href="#/${item.id}" class="${state.activePage === item.id ? 'is-active' : ''}" data-page="${item.id}" ${state.activePage === item.id ? 'aria-current="page"' : ''}>
          <i class="nav-mark nav-mark--${item.icon}"></i><span>${escapeHtml(item.label)}</span>
        </a>`
    )
    .join('');
}

function renderDashboardPage(summary) {
  return `
    <section class="metrics" aria-label="关键指标">${renderMetricCards(summary)}</section>
    <section class="lower-grid dashboard-grid">
      <div class="panel compact-panel"><div class="section-head"><h2>待处理预约</h2><span>${state.reservations.length} 条</span></div>${renderReservations()}</div>
      <div class="panel compact-panel"><div class="section-head"><h2>进行中对局</h2><span>${state.openSessions.length} 局</span></div>${renderSessions()}</div>
      <div class="panel compact-panel"><div class="section-head"><h2>会员排行</h2><span>胜率</span></div>${renderLeaderboard()}</div>
    </section>
    <section class="panel catalog">
      <div class="section-head"><h2>桌游目录热度</h2><span>封面 / 人数 / 近 30 天</span></div>
      <div class="game-grid">${renderGameCatalog()}</div>
    </section>`;
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

function renderRecommendPage() {
  return renderRecommendations();
}

function renderSessionsPage() {
  return `
    <section class="lower-grid sessions-grid">
      <div class="panel compact-panel"><div class="section-head"><h2>待处理预约</h2><span>${state.reservations.length} 条</span></div>${renderReservations()}</div>
      <div class="panel compact-panel"><div class="section-head"><h2>进行中对局</h2><span>${state.openSessions.length} 局</span></div>${renderSessions()}</div>
      <div class="panel compact-panel"><div class="section-head"><h2>会员排行</h2><span>胜率</span></div>${renderLeaderboard()}</div>
    </section>
    <section class="panel catalog">
      <div class="section-head"><h2>桌游目录热度</h2><span>用于录入战绩时选择游戏</span></div>
      <div class="game-grid">${renderGameCatalog()}</div>
    </section>`;
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

  return `
    <section class="report-kpis">
      <div class="report-kpi"><span>今日收入</span><strong>¥${moneyFromRevenue()}</strong><small>已结算 ${settled} 单</small></div>
      <div class="report-kpi"><span>计费时长</span><strong>${Number(minutes || 0)}</strong><small>分钟</small></div>
      <div class="report-kpi"><span>活跃桌位</span><strong>${state.tableUtilization.filter((row) => Number(row.settled_sessions_in_range ?? row.settledSessionsInRange ?? 0) > 0).length}</strong><small>近 30 天有结算记录</small></div>
    </section>
    <section class="report-grid">
      <div class="panel report-panel">
        <div class="section-head"><h2>桌游热度排行</h2><span>近 30 天战绩记录</span></div>
        <div class="report-list">${popularityRows || '<div class="empty-state compact">暂无热度数据。</div>'}</div>
      </div>
      <div class="panel report-panel">
        <div class="section-head"><h2>桌位利用率</h2><span>近 30 天已结算对局</span></div>
        <div class="report-list">${tableRows || '<div class="empty-state compact">暂无桌位利用率数据。</div>'}</div>
      </div>
    </section>`;
}

function renderCustomerBookingPage() {
  const selectedTable = state.customerMatches.find((table) => Number(table.tableId) === Number(state.customerSelectedTableId));
  return `
    <section class="customer-booking">
      <div class="panel customer-card">
        <div class="section-head">
          <div>
            <h2>远程预约</h2>
            <span>填写人数和到店时间后，系统会匹配容量合适的空闲桌位或包间。</span>
          </div>
          <span class="soft-chip">${state.venue?.name ? escapeHtml(state.venue.name) : '桌游门店'}</span>
        </div>
        ${
          state.customerResult
            ? `<div class="success-panel">
                <strong>预约已提交</strong>
                <span>预约号 #${state.customerResult.reservationId}，桌位 ${escapeHtml(state.customerResult.tableCode || '')}，${state.customerResult.seatCapacity || ''} 人桌。</span>
              </div>`
            : ''
        }
        <div class="customer-booking-grid">
          <form class="form-grid customer-form">
            <label class="field"><span>姓名 / 称呼</span><input class="input" data-field="customerGuestName" value="${escapeAttr(state.customerGuestName)}" /></label>
            <label class="field"><span>联系电话</span><input class="input" data-field="customerPhone" value="${escapeAttr(state.customerPhone)}" /></label>
            <label class="field"><span>人数</span><input class="input" type="number" min="1" max="20" data-field="customerPartySize" value="${escapeAttr(state.customerPartySize)}" /></label>
            <label class="field"><span>开始时间</span><input class="input" type="datetime-local" data-field="customerStartAt" value="${escapeAttr(state.customerStartAt)}" /></label>
            <label class="field"><span>结束时间</span><input class="input" type="datetime-local" data-field="customerEndAt" value="${escapeAttr(state.customerEndAt)}" /></label>
            <div class="form-actions two">
              <button class="btn btn-secondary" data-customer-match type="button">匹配桌位</button>
              <button class="btn btn-primary" data-customer-submit type="button">${selectedTable ? `预约 ${escapeHtml(selectedTable.code)}` : '自动分配并预约'}</button>
            </div>
          </form>
          <div class="match-panel">
            <div class="mini-section-head"><strong>可选桌位</strong><span>${selectedTable ? `已选 ${escapeHtml(selectedTable.code)}` : '未选择时将自动分配最优桌位'}</span></div>
            ${renderTableMatchList(state.customerMatches, 'customer')}
          </div>
        </div>
      </div>
    </section>`;
}

function renderPublicCustomerShell() {
  return `
    <div class="public-shell">
      <header class="public-topbar">
        <div>
          <span class="eyebrow">Customer Booking</span>
          <h1>客户远程预约</h1>
          <p>无需登录，提交后门店后台会看到预约记录。</p>
        </div>
        <a class="btn btn-ghost" href="#/dashboard">${state.currentUser ? '进入后台' : '员工登录'}</a>
      </header>
      ${renderCustomerBookingPage()}
    </div>
    <div id="toast-host" class="toast-host"></div>`;
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
                <img class="game-card-img" src="${escapeAttr(g.coverImageUrl || 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80')}" alt="${escapeAttr(g.title)}" onerror="this.src='https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80'" />
                <div class="game-card-body">
                  <h3>${escapeHtml(g.title)}${g.publishYear ? `<small style="font-weight:400;color:var(--text-soft);font-size:13px">${g.publishYear}</small>` : ''}</h3>
                  <p class="meta">${g.minPlayers}-${g.maxPlayers}人 · ${g.avgMinutes}分钟 · ${dif} · ${escapeHtml(g.category)}</p>
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
            <div class="form-group"><label>描述 / 规则简介</label><textarea name="description" class="form-input" placeholder="输入桌游描述、规则要点..." id="game-desc"></textarea></div>
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
  const token = window.localStorage.getItem(AUTH_KEY) || '';
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const isAdmin = state.currentUser?.role === 'admin';

  let html = '';
  try {
    const [staffRes, tenantRes] = await Promise.all([
      fetch('/api/staff-mgmt/list', { headers: h }),
      fetch('/api/tenant/info', { headers: h }),
    ]);
    const staffData = await staffRes.json();
    const tenantData = await tenantRes.json();
    const staff = staffData.data || [];

    const statsHtml = tenantData ? `
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-value">${tenantData.staffCount||0}</div><div class="stat-label">总员工数</div></div>
        <div class="stat-card"><div class="stat-value">${tenantData.gameCount||0}</div><div class="stat-label">桌游数量</div></div>
        <div class="stat-card"><div class="stat-value">${tenantData.planType||'free'}</div><div class="stat-label">订阅方案</div></div>
        <div class="stat-card"><div class="stat-value">${tenantData.status||'active'}</div><div class="stat-label">租户状态</div></div>
      </div>` : '';

    html = statsHtml + (isAdmin ? `
      <div class="toolbar">
        <div class="search-bar" style="flex:1"><input type="text" placeholder="搜索员工..." /></div>
        <button class="btn btn-primary" id="btn-add-staff">+ 添加员工</button>
      </div>
      <div class="apple-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>员工</th><th>账号</th><th>角色</th><th>岗位</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            ${staff.length === 0 ? '<tr><td colspan="7" class="empty">暂无员工</td></tr>' : staff.map(s => {
              const isMe = s.id === state.currentUser?.id;
              return `
              <tr style="${isMe ? 'background:var(--primary-soft)' : ''}">
                <td><strong>${escapeHtml(s.fullName||s.displayName)}</strong>${isMe ? ' <span class="badge badge-blue">你</span>' : ''}<br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(s.employeeNo||'')}</span></td>
                <td>${escapeHtml(s.username)}</td>
                <td><span class="badge ${s.role==='admin'?'badge-blue':'badge-green'}">${s.role==='admin'?'管理员':'员工'}</span></td>
                <td>${escapeHtml(s.position||'')}</td>
                <td><span class="badge ${s.status==='active'?'badge-green':'badge-rose'}">${s.status==='active'?'启用':'禁用'}</span></td>
                <td style="font-size:13px;color:var(--text-muted)">${new Date(s.createdAt).toLocaleDateString('zh-CN')}</td>
                <td>${isMe
                  ? '<span style="font-size:12px;color:var(--text-soft)">当前账号</span>'
                  : `<div class="action-group">
                      <button class="icon-btn" data-toggle-role="${s.id}" data-current-role="${s.role}" title="切换角色">🔄</button>
                      <button class="icon-btn ${s.status==='active'?'danger':''}" data-toggle-status="${s.id}" data-current-status="${s.status}" title="${s.status==='active'?'禁用':'启用'}">${s.status==='active'?'⏸':'▶'}</button>
                    </div>`
                }</td>
              </tr>`;}).join('')}
          </tbody>
        </table>
      </div>
      ` : `<div class="apple-card"><p style="text-align:center;color:var(--text-muted)">需要管理员权限才能管理员工。当前角色：${state.currentUser?.role||'未知'}</p></div>`);
  } catch (e) {
    html = '<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>可能需要管理员权限</p></div>';
  }

  return `<div class="page-hero"><div class="eyebrow">Admin</div><h2>员工与权限管理</h2><p>管理员工账号、角色权限和启用状态</p></div>
    ${html}
    <div id="staff-modal" class="modal-overlay" style="display:none">
      <div class="modal-dialog">
        <div class="modal-header"><h3>添加员工</h3><button class="modal-close" id="btn-close-staff-modal">&times;</button></div>
        <div class="modal-body">
          <form id="staff-form">
            <div class="form-row">
              <div class="form-group"><label>账号 *</label><input type="text" name="username" class="form-input" required placeholder="登录名" /></div>
              <div class="form-group"><label>显示名称 *</label><input type="text" name="displayName" class="form-input" required placeholder="显示名称" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>密码 *</label><input type="password" name="password" class="form-input" required placeholder="至少6位" /></div>
              <div class="form-group"><label>角色</label><select name="role" class="form-input"><option value="staff">员工</option><option value="admin">管理员</option></select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>真实姓名</label><input type="text" name="fullName" class="form-input" placeholder="员工真实姓名" /></div>
              <div class="form-group"><label>岗位</label><input type="text" name="position" class="form-input" placeholder="如：店长、店员" value="店员" /></div>
            </div>
            <div class="form-group"><label>手机号</label><input type="tel" name="phone" class="form-input" placeholder="手机号" /></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-staff">取消</button>
          <button class="btn btn-primary" id="btn-save-staff">创建</button>
        </div>
      </div>
    </div>`;
}

async function renderPageContent(summary) {
  if (state.activePage === 'tables') return renderTablesPage();
  if (state.activePage === 'members') return renderMembersPage();
  if (state.activePage === 'staff') return renderStaffManagementPage();
  if (state.activePage === 'recommend') return renderRecommendPage();
  if (state.activePage === 'sessions') return renderSessionsPage();
  if (state.activePage === 'reports') return renderReportsPage();
  if (state.activePage === 'games') return await renderGameManagementPage();
  if (state.activePage === 'staff-mgmt') return await renderStaffAdminPage();
  return renderDashboardPage(summary);
}

function navigateToPage(pageId) {
  const nextPage = pageIds.has(pageId) ? pageId : 'dashboard';
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
  const summary = counts();
  const page = currentPageMeta();
  const venueName = state.venue?.name || '桌游门店';
  const pageContent = await renderPageContent(summary);
  const hasOwnHeader = page.id === 'games' || page.id === 'staff-mgmt';
  $('#app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard" data-page="dashboard">
          <div class="brand-icon">🎲</div>
        </a>
        <nav class="nav-list" aria-label="主导航">
          ${renderNav()}
        </nav>
        <div class="sidebar-footer">
          <span class="${healthClass()}" style="font-size:11px;display:block;text-align:center;padding:8px"><i></i>${escapeHtml(state.health)}</span>
        </div>
      </aside>
      <main class="main" id="page-${escapeAttr(page.id)}">
        <header class="topbar">
          <div class="topbar-left">
            ${hasOwnHeader ? '' : `<div class="topbar-title"><span class="eyebrow">${escapeHtml(page.eyebrow)}</span><h1>${escapeHtml(page.title)}</h1></div>`}
          </div>
          <div class="topbar-right">
            ${state.reservations.filter(r => r.status === 'pending').length > 0 ? `<span class="topbar-stat">${state.reservations.filter(r => r.status === 'pending').length} 待处理</span>` : ''}
            ${state.openSessions.length > 0 ? `<span class="topbar-stat">${state.openSessions.length} 进行中</span>` : ''}
            <span class="user-pill">${escapeHtml(state.currentUser.displayName || state.currentUser.username)}</span>
            <button class="icon-btn" data-refresh title="刷新" style="font-size:14px">↻</button>
            <button class="btn btn-ghost btn-sm" data-logout>退出</button>
          </div>
        </header>
        ${state.err ? `<div class="notice">${escapeHtml(state.err)}</div>` : ''}
        ${pageContent}
      </main>
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
      navigateToPage(link.getAttribute('data-page'));
    })
  );
  root.querySelector('[data-login]')?.addEventListener('click', () => void onLogin());
  root.querySelector('[data-register]')?.addEventListener('click', () => void onRegister());
  root.querySelector('[data-logout]')?.addEventListener('click', () => void onLogout());
  root.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', () => void refresh()));
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
  root.querySelector('[data-field="staffSearch"]')?.addEventListener('change', () => void refresh());
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
  root.querySelector('[data-record]')?.addEventListener('click', onRecord);
  root.querySelector('[data-recommend]')?.addEventListener('click', onRecommend);
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
  root.querySelectorAll('[data-recommend-table]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedId = Number(button.getAttribute('data-recommend-table'));
      navigateToPage('tables');
    })
  );
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

  // ---- Game Management ----
  $('#btn-add-game')?.addEventListener('click', () => openGameModal(null));
  $('#btn-close-game-modal')?.addEventListener('click', closeGameModal);
  $('#btn-cancel-game')?.addEventListener('click', closeGameModal);
  $('#btn-save-game')?.addEventListener('click', () => void onSaveGame());
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
  $('#btn-add-staff')?.addEventListener('click', () => { $('#staff-modal').style.display = 'flex'; });
  $('#btn-close-staff-modal')?.addEventListener('click', () => { $('#staff-modal').style.display = 'none'; });
  $('#btn-cancel-staff')?.addEventListener('click', () => { $('#staff-modal').style.display = 'none'; });
  $('#btn-save-staff')?.addEventListener('click', () => void onAddStaffAccount());
  $('#staff-modal')?.addEventListener('click', (e) => { if (e.target.id === 'staff-modal') e.target.style.display = 'none'; });
  root.querySelectorAll('[data-toggle-role]').forEach(btn => {
    btn.addEventListener('click', () => void onToggleStaffRole(Number(btn.getAttribute('data-toggle-role')), btn.getAttribute('data-current-role')));
  });
  root.querySelectorAll('[data-toggle-status]').forEach(btn => {
    btn.addEventListener('click', () => void onToggleStaffStatus(Number(btn.getAttribute('data-toggle-status')), btn.getAttribute('data-current-status')));
  });
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

async function onRecommend() {
  const partySize = Math.max(1, Math.min(20, Number(state.recommendPartySize || 4)));
  const minutes = Math.max(10, Math.min(600, Number(state.recommendMinutes || 120)));
  state.recommendPartySize = partySize;
  state.recommendMinutes = minutes;

  if (state.mode !== 'live') {
    state.gameRecommendations = demoData.gameRecommendations;
    state.tableRecommendations = demoData.tableRecommendations;
    state.recommendationUpdatedAt = new Date().toISOString();
    showToast('当前使用演示推荐数据');
    render();
    return;
  }

  const playerId = state.recommendPlayerId || state.selectedMemberId || '';
  const category = encodeURIComponent(state.recommendCategory || '');
  const gameUrl = `/api/recommendations/games?playerId=${encodeURIComponent(playerId)}&partySize=${partySize}&minutes=${minutes}&category=${category}`;
  const tableUrl = `/api/recommendations/tables?partySize=${partySize}&startAt=${encodeURIComponent(localInputToMysqlDatetime(state.startAt))}&endAt=${encodeURIComponent(localInputToMysqlDatetime(state.endAt))}`;

  try {
    const [games, tables] = await Promise.all([api(gameUrl), api(tableUrl)]);
    state.gameRecommendations = games;
    state.tableRecommendations = tables;
    state.recommendationUpdatedAt = new Date().toISOString();
    showToast('智能推荐已生成');
    render();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

function normalizedPartySize(value) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value || 1))));
}

function hasInvalidTimeRange(startAt, endAt) {
  return !startAt || !endAt || new Date(startAt) >= new Date(endAt);
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

  if (!guestName || !guestPhone) {
    showToast('请填写姓名和联系电话。', 'err');
    return;
  }
  if (hasInvalidTimeRange(state.customerStartAt, state.customerEndAt)) {
    showToast('请先填写有效的到店和离店时间。', 'err');
    return;
  }

  try {
    const result = await api('/api/public/reservations', {
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
    state.closedSessionId = String(openSession.id);
    showToast(`已结算关台，sessionId ${openSession.id} 已填入战绩区`);
    await refresh();
  } catch (error) {
    showToast(error.message, 'err');
  }
}

async function onRecord() {
  if (!requireLive()) return;
  const sessionId = Number(state.closedSessionId);
  if (!sessionId) {
    showToast('请先填写已结算 sessionId', 'err');
    return;
  }
  try {
    await api(`/api/sessions/${sessionId}/game-records`, {
      method: 'POST',
      body: JSON.stringify({
        gameId: Number(state.gameId),
        winnerPlayerId: state.winnerId === '' ? null : Number(state.winnerId),
        winnerDisplayName: null,
        scoreJson: null,
      }),
    });
    showToast('战绩已写入');
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
async function onAddStaffAccount() {
  const form = document.getElementById('staff-form');
  if (!form) return;
  const fd = new FormData(form);
  const payload = {
    username: fd.get('username')?.toString().trim(),
    displayName: fd.get('displayName')?.toString().trim(),
    password: fd.get('password')?.toString(),
    role: fd.get('role')?.toString()||'staff',
    fullName: fd.get('fullName')?.toString().trim()||null,
    position: fd.get('position')?.toString().trim()||'店员',
    phone: fd.get('phone')?.toString().trim()||null,
  };
  if (!payload.username||!payload.displayName||!payload.password) { showToast('请填写账号、显示名称和密码', 'err'); return; }
  if (payload.password.length < 6) { showToast('密码至少6位', 'err'); return; }

  try {
    await api('/api/staff-mgmt/create', { method: 'POST', body: JSON.stringify(payload) });
    showToast('员工账号已创建');
    $('#staff-modal').style.display = 'none';
    form.reset();
    await refresh();
  } catch (e) { showToast(e.message, 'err'); }
}

async function onToggleStaffRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'staff' : 'admin';
  try {
    await api(`/api/staff-mgmt/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
    showToast(`角色已切换为 ${newRole==='admin'?'管理员':'员工'}`);
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

async function init() {
  if (!window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/dashboard`);
  }
  if (!state.authToken) {
    render();
    return;
  }
  try {
    const result = await api('/api/auth/me');
    if (result.user) {
      state.currentUser = result.user;
      await refresh();
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
  state.activePage = nextPage;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
});

init();

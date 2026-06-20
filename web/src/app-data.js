export const statusText = {
  idle: '空闲',
  reserved: '已预约',
  occupied: '占用中',
};

export const navItems = [
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
    id: 'sessions',
    label: '对局状态',
    icon: 'workflow',
    eyebrow: 'Sessions',
    title: '预约与进行中对局',
    description: '查看待处理预约、进行中对局和会员排行；战绩由顾客在自己的预约记录中提交。',
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
    id: 'coupons',
    label: '优惠券',
    icon: 'records',
    eyebrow: 'Coupons',
    title: '优惠券管理',
    description: '创建、发放和追踪优惠券效果。',
  },
  {
    id: 'billing',
    label: '订单计费',
    icon: 'records',
    eyebrow: 'Billing',
    title: '订单与计费',
    description: '查看订单列表、收入统计和优惠分析。',
  },
  {
    id: 'rental',
    label: '桌游租借',
    icon: 'records',
    eyebrow: 'Rental',
    title: '桌游租借管理',
    description: '管理实体桌游库存、借出归还、押金与逾期。',
  },
  {
    id: 'ai',
    label: 'AI 助手',
    icon: 'recommend',
    eyebrow: 'AI Assistant',
    title: 'AI 经营助手',
    description: '用自然语言查询经营数据，获取桌游与运营建议。',
  },
  {
    id: 'staff-mgmt',
    label: '员工与权限',
    icon: 'staff',
    eyebrow: 'Admin',
    title: '员工与权限管理',
    description: '管理员工档案、后台账号、店长/员工权限和启用状态。',
  },
];

export const hiddenAdminPageIds = new Set(['staff', 'billing', 'ai']);
export const visibleNavItems = navItems.filter((item) => !hiddenAdminPageIds.has(item.id));
export const publicPageIds = new Set(['customer']);
// 数据大屏：可通过 #/screen 直达与按钮跳转，但不进侧边栏（全屏沉浸式布局）。
export const adminUtilityPageIds = new Set(['screen']);
export const navigateIds = new Set([...visibleNavItems.map((item) => item.id), ...adminUtilityPageIds]);
export const pageIds = new Set([...navigateIds, ...publicPageIds]);
export const ADMIN_PATH = '/admin';

export function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === ADMIN_PATH;
}

export function defaultPageForLocation() {
  return isAdminPath() ? 'dashboard' : 'customer';
}

export function pageFromHash() {
  const fallback = defaultPageForLocation();
  const key = window.location.hash.replace(/^#\/?/, '').trim() || fallback;
  return pageIds.has(key) ? key : fallback;
}

export const demoData = {
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
  games: [],
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
  popularity: [],
  tableUtilization: [
    { code: 'A03', settled_sessions_in_range: 18 },
    { code: 'B03', settled_sessions_in_range: 15 },
    { code: 'C04', settled_sessions_in_range: 13 },
    { code: 'A01', settled_sessions_in_range: 11 },
  ],
  gameRecommendations: [],
  tableRecommendations: [
    { tableId: 1, code: 'A01', seatCapacity: 4, areaType: 'standard', status: 'idle', score: 94, reason: '容量适合 4 人，当前空闲，近期使用较均衡。' },
    { tableId: 8, code: 'B04', seatCapacity: 4, areaType: 'standard', status: 'idle', score: 90, reason: '容量适合 4 人，当前空闲。' },
  ],
};

export const clientErrorMessages = {
  unauthorized: '请先登录后再操作',
  forbidden: '当前账号没有执行该操作的权限',
  invalid_credentials: '账号或密码错误',
  phone_registered: '该手机号已经注册，请直接登录',
  invalid_phone: '手机号格式不正确',
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
  session_not_started: '该预约尚未入场，暂时不能填写战绩',
  session_still_open: '该对局仍在进行中，请先结算关台再录入战绩',
  record_exists: '该预约已经提交过战绩',
  recording_moved_to_customer: '后台战绩录入已关闭，请由顾客在自己的预约记录中提交',
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

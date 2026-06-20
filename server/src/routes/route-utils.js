export function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.round(n));
}

export function toMysqlDatetime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function normalizeMysqlDatetimeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

export function parseDateInput(value, fallback) {
  if (!value) return fallback;
  const normalized = String(value).trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildGameReason(row, query) {
  const parts = [];
  const peopleScore = Number(row.people_score || 0);
  const durationScore = Number(row.duration_score || 0);
  const historyScore = Number(row.history_score || 0);
  const hotScore = Number(row.hot_score || 0);

  if (peopleScore >= 90) parts.push(`适合 ${query.partySize} 人`);
  else parts.push(`人数略有偏差但仍可安排`);
  if (durationScore >= 80) parts.push(`时长接近 ${query.minutes} 分钟`);
  if (query.category && row.category === query.category) parts.push(`匹配${row.category}偏好`);
  if (historyScore >= 90) parts.push('会员历史记录高度匹配');
  else if (historyScore >= 70) parts.push('会员曾偏好同类游戏');
  if (hotScore >= 50) parts.push('近期热度较高');
  if (!parts.length) parts.push('综合人数、时长和门店权重后排序靠前');
  return `${parts.join('，')}。`;
}

export function buildTableReason(row, partySize) {
  const parts = [];
  const capacityScore = Number(row.capacity_score || 0);
  const availabilityScore = Number(row.availability_score || 0);
  const utilizationScore = Number(row.utilization_score || 0);

  if (capacityScore >= 90) parts.push(`容量适合 ${partySize} 人`);
  else parts.push(`容量可接待 ${partySize} 人但不是最优`);
  if (availabilityScore >= 95) parts.push('当前空闲');
  else parts.push('该时段无冲突预约');
  if (utilizationScore >= 80) parts.push('近期使用较均衡');
  return `${parts.join('，')}。`;
}

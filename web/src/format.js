function pad(n) {
  return String(n).padStart(2, '0');
}

export function toLocalInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addHours(d, h) {
  return new Date(d.getTime() + h * 3600000);
}

export function localInputToMysqlDatetime(dtLocal) {
  const raw = String(dtLocal || '').trim();
  if (!raw) return '';
  const normalized = raw.replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

export function parseAppDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function yuan(cents) {
  const n = Number(cents || 0) / 100;
  return `¥${n.toFixed(n % 1 ? 2 : 0)}`;
}

export function formatTime(value) {
  if (!value) return '未设置';
  const d = parseAppDate(value);
  if (!d) return String(value);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value) {
  if (!value) return '未设置';
  const d = parseAppDate(value);
  if (!d) return String(value);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatTimeRange(start, end) {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

export function formatDurationFrom(value) {
  const d = parseAppDate(value);
  if (!d) return '进行中';
  const minutes = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

export function formatWinRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return escapeHtml(value || '0%');
  if (numeric <= 1) return `${Math.round(numeric * 1000) / 10}%`;
  return `${Math.round(numeric * 10) / 10}%`;
}

// ELO 段位映射
export function eloTier(elo) {
  const n = Number(elo) || 1200;
  if (n >= 1800) return { name: '钻石', cls: 'tier-diamond' };
  if (n >= 1600) return { name: '铂金', cls: 'tier-platinum' };
  if (n >= 1400) return { name: '黄金', cls: 'tier-gold' };
  if (n >= 1200) return { name: '白银', cls: 'tier-silver' };
  return { name: '青铜', cls: 'tier-bronze' };
}

export function yuan(cents: number): string {
  const n = (cents || 0) / 100;
  return `¥${n.toFixed(n % 1 ? 2 : 0)}`;
}

export function formatTime(value: string | undefined | null): string {
  if (!value) return '未设置';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '未设置';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatDateTime(start)} — ${formatDateTime(end)}`;
}

export function formatDurationFrom(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '进行中';
  const minutes = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
}

export function formatWinRate(value: number | string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0%';
  if (numeric <= 1) return `${Math.round(numeric * 1000) / 10}%`;
  return `${Math.round(numeric * 10) / 10}%`;
}

export function areaTypeText(value: string): string {
  const map: Record<string, string> = {
    standard: '标准区', party: '聚会区', private: '包间', quiet: '安静区',
  };
  return map[value] || value || '标准区';
}

export function reservationStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '待入场', active: '已入场', cancelled: '已取消', completed: '已完成', no_show: '未到店',
  };
  return map[status] || status || '未知';
}

export function toMysqlDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

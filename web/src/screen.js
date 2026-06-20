// =====================================================================
// 数据大屏 — 全屏沉浸式实时经营监控（ECharts）
// 独立深色科技风布局，绕过后台侧边栏，用于答辩演示与门店投屏。
// 数据来源：/api/reports/revenue-trend、game-popularity、table-utilization、
//          /api/ai/dashboard-snapshot（AI 经营洞察）。
// =====================================================================
import * as echarts from 'echarts';
import { escapeHtml } from './format.js';

const BRAND = {
  orange: '#f97316',
  purple: '#a855f7',
  pink: '#ec4899',
  cyan: '#22d3ee',
  green: '#34d399',
  amber: '#fbbf24',
  grid: 'rgba(148, 163, 184, 0.14)',
  axis: 'rgba(226, 232, 240, 0.55)',
  text: '#e2e8f0',
};

// 大屏挂载的 ECharts 实例，render 重绘前需 dispose 释放。
let charts = [];
let clockTimer = null;

export function disposeScreenCharts() {
  charts.forEach((chart) => {
    try {
      chart.dispose();
    } catch {
      // ignore
    }
  });
  charts = [];
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  window.removeEventListener('resize', handleResize);
}

function handleResize() {
  charts.forEach((chart) => {
    try {
      chart.resize();
    } catch {
      // ignore
    }
  });
}

function fmtMoney(value) {
  const n = Number(value || 0);
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return n.toLocaleString('zh-CN');
}

// 顶部 KPI 卡：从趋势序列与快照聚合关键经营指标。
function buildKpis({ trend, snapshot, popularity, utilization }) {
  const totalRevenue = trend.reduce((sum, row) => sum + Number(row.revenueYuan || 0), 0);
  const totalSessions = trend.reduce((sum, row) => sum + Number(row.settledSessions || 0), 0);
  const totalMinutes = trend.reduce((sum, row) => sum + Number(row.billedMinutes || 0), 0);
  const avgTicket = totalSessions > 0 ? totalRevenue / totalSessions : 0;
  const todayRow = trend[trend.length - 1] || {};
  const activeTables = utilization.filter((row) => Number(row.settled_sessions_in_range ?? row.settledSessionsInRange ?? 0) > 0).length;
  const liveGames = popularity.reduce((sum, row) => sum + Number(row.record_count ?? row.recordCount ?? 0), 0);
  const tableState = snapshot?.tableState;
  const tableTotal = tableState ? (tableState.idle || 0) + (tableState.reserved || 0) + (tableState.occupied || 0) : 0;
  const occupancy = tableTotal > 0 ? Math.round(((tableState.occupied || 0) / tableTotal) * 100) : null;
  return [
    { label: '近 30 日营收', value: `¥${fmtMoney(totalRevenue)}`, hint: `今日 ¥${fmtMoney(todayRow.revenueYuan)}`, color: BRAND.orange, icon: '💰' },
    { label: '结算对局', value: `${totalSessions}`, hint: `客单价 ¥${avgTicket.toFixed(0)}`, color: BRAND.cyan, icon: '🎲' },
    { label: '计费时长', value: `${(totalMinutes / 60).toFixed(0)}h`, hint: `${totalMinutes.toLocaleString('zh-CN')} 分钟`, color: BRAND.purple, icon: '⏱️' },
    { label: '战绩记录', value: `${liveGames}`, hint: '近 30 日对局明细', color: BRAND.green, icon: '🏆' },
    { label: '活跃桌位', value: `${activeTables}`, hint: occupancy != null ? `实时占用 ${occupancy}%` : '近 30 日有结算', color: BRAND.pink, icon: '🪑' },
  ];
}

// AI 经营洞察：优先展示快照里的风险研判，再用趋势/热度数据补足，
// 保证面板始终有 3-4 条有信息量的洞察（答辩演示的 AI 展示位）。
function buildInsights({ snapshot, trend, popularity, utilization }) {
  const insights = [];
  const risks = snapshot?.risks || [];
  risks.slice(0, 2).forEach((risk) => {
    insights.push({
      level: risk.level || 'warning',
      title: risk.title || risk.label || '运营提示',
      detail: risk.detail || risk.message || risk.suggestion || '',
    });
  });

  // 营收趋势方向：对比最近 7 日与前 7 日。
  if (trend.length >= 14) {
    const recent = trend.slice(-7).reduce((s, r) => s + Number(r.revenueYuan || 0), 0);
    const prev = trend.slice(-14, -7).reduce((s, r) => s + Number(r.revenueYuan || 0), 0);
    if (prev > 0) {
      const delta = Math.round(((recent - prev) / prev) * 100);
      insights.push({
        level: delta >= 0 ? 'info' : 'warning',
        title: delta >= 0 ? `营收周环比上升 ${delta}%` : `营收周环比下降 ${Math.abs(delta)}%`,
        detail: `近 7 日 ¥${fmtMoney(recent)}，上一周期 ¥${fmtMoney(prev)}。${delta >= 0 ? '建议保持当前排期与营销节奏。' : '建议加强周中时段引流与会员唤醒。'}`,
      });
    }
  }

  // 热门桌游：用于补货与推荐位运营。
  const topGame = popularity[0];
  if (topGame && Number(topGame.record_count ?? topGame.recordCount ?? 0) > 0) {
    insights.push({
      level: 'info',
      title: `热门桌游：${topGame.title || topGame.game_title || ''}`,
      detail: `近 30 日 ${Number(topGame.record_count ?? topGame.recordCount ?? 0)} 局，建议优先保障库存并放入首页推荐位。`,
    });
  }

  // 桌位冷热：找出利用率最低的桌位，提示运营调整。
  const ranked = [...utilization]
    .map((row) => ({ code: row.code || row.tableCode, value: Number(row.settled_sessions_in_range ?? row.settledSessionsInRange ?? 0) }))
    .filter((row) => row.code)
    .sort((a, b) => a.value - b.value);
  if (ranked.length >= 2) {
    const cold = ranked[0];
    insights.push({
      level: 'info',
      title: `冷门桌位：${cold.code}`,
      detail: `近 30 日仅 ${cold.value} 次结算，可考虑调整桌位布局或用于新手教学/活动专桌。`,
    });
  }

  if (!insights.length) {
    insights.push({ level: 'info', title: '经营状态平稳', detail: '近 30 日数据无异常波动，桌位与库存供给充足。' });
  }
  return insights.slice(0, 4);
}

export function renderScreenPage(state) {
  const trend = Array.isArray(state.revenueTrend) ? state.revenueTrend : [];
  const popularity = Array.isArray(state.popularity) ? state.popularity : [];
  const utilization = Array.isArray(state.tableUtilization) ? state.tableUtilization : [];
  const snapshot = state.aiSnapshot || null;
  const venueName = state.venue?.name || '骰子猫桌游馆';

  const kpis = buildKpis({ trend, snapshot, popularity, utilization });
  const insights = buildInsights({ snapshot, trend, popularity, utilization });

  const kpiCards = kpis
    .map(
      (kpi) => `
      <div class="screen-kpi" style="--kpi:${kpi.color}">
        <span class="screen-kpi__icon">${kpi.icon}</span>
        <div class="screen-kpi__body">
          <span class="screen-kpi__label">${escapeHtml(kpi.label)}</span>
          <strong class="screen-kpi__value">${escapeHtml(kpi.value)}</strong>
          <span class="screen-kpi__hint">${escapeHtml(kpi.hint)}</span>
        </div>
      </div>`
    )
    .join('');

  const levelClass = { high: 'is-high', warning: 'is-warning', medium: 'is-warning', low: 'is-info', info: 'is-info' };
  const insightRows = insights
    .map(
      (item) => `
      <div class="screen-insight ${levelClass[item.level] || 'is-info'}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.detail)}</span>
      </div>`
    )
    .join('');

  const now = new Date();
  const clock = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `
    <div class="screen-root">
      <div class="screen-bg"></div>
      <header class="screen-head">
        <div class="screen-head__title">
          <span class="screen-logo">🎲</span>
          <div>
            <h1>${escapeHtml(venueName)} · 智能运营驾驶舱</h1>
            <p>AI-Driven Boardgame Space · Real-time Operations Monitor</p>
          </div>
        </div>
        <div class="screen-head__meta">
          <span class="screen-live"><i></i>实时</span>
          <span class="screen-clock" data-screen-clock>${clock}</span>
          <a class="screen-exit" href="#/dashboard" data-page="dashboard">返回后台</a>
        </div>
      </header>

      <section class="screen-kpis">${kpiCards}</section>

      <section class="screen-grid">
        <div class="screen-panel screen-panel--wide">
          <div class="screen-panel__head"><h2>营收趋势</h2><span>近 30 日 · 元</span></div>
          <div class="screen-chart" data-chart="revenue"></div>
        </div>
        <div class="screen-panel">
          <div class="screen-panel__head"><h2>AI 经营洞察</h2><span>智能研判</span></div>
          <div class="screen-insights">${insightRows}</div>
        </div>
        <div class="screen-panel">
          <div class="screen-panel__head"><h2>桌游热度 TOP</h2><span>近 30 日战绩</span></div>
          <div class="screen-chart" data-chart="popularity"></div>
        </div>
        <div class="screen-panel">
          <div class="screen-panel__head"><h2>桌位利用率</h2><span>近 30 日结算</span></div>
          <div class="screen-chart" data-chart="utilization"></div>
        </div>
      </section>
    </div>`;
}

// 在 DOM 注入后初始化所有 ECharts 实例。render() 调用 bind 后触发。
export function initScreenCharts(state) {
  disposeScreenCharts();
  const trend = Array.isArray(state.revenueTrend) ? state.revenueTrend : [];
  const popularity = Array.isArray(state.popularity) ? state.popularity : [];
  const utilization = Array.isArray(state.tableUtilization) ? state.tableUtilization : [];

  const revenueEl = document.querySelector('[data-chart="revenue"]');
  if (revenueEl) charts.push(renderRevenueChart(revenueEl, trend));

  const popularityEl = document.querySelector('[data-chart="popularity"]');
  if (popularityEl) charts.push(renderPopularityChart(popularityEl, popularity));

  const utilizationEl = document.querySelector('[data-chart="utilization"]');
  if (utilizationEl) charts.push(renderUtilizationChart(utilizationEl, utilization));

  window.addEventListener('resize', handleResize);

  // 实时时钟：每 30 秒刷新一次，营造大屏「实时」感。
  const tick = () => {
    const el = document.querySelector('[data-screen-clock]');
    if (!el) return;
    const n = new Date();
    el.textContent = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function baseGrid(extra = {}) {
  return { left: 48, right: 24, top: 28, bottom: 32, containLabel: true, ...extra };
}

function renderRevenueChart(el, trend) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  const labels = trend.map((row) => row.label);
  const values = trend.map((row) => Number(row.revenueYuan || 0));
  chart.setOption({
    grid: baseGrid(),
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(148,163,184,0.25)',
      textStyle: { color: BRAND.text },
      valueFormatter: (v) => `¥${Number(v).toLocaleString('zh-CN')}`,
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: BRAND.axis } },
      axisLabel: { color: BRAND.axis, interval: Math.ceil(labels.length / 10) },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: BRAND.grid } },
      axisLabel: { color: BRAND.axis, formatter: (v) => fmtMoney(v) },
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 3, color: BRAND.orange },
        itemStyle: { color: BRAND.orange },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(249, 115, 22, 0.45)' },
            { offset: 1, color: 'rgba(249, 115, 22, 0.02)' },
          ]),
        },
      },
    ],
  });
  return chart;
}

function renderPopularityChart(el, popularity) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  const top = popularity.slice(0, 8);
  const labels = top.map((row) => row.title || row.game_title || '未知');
  const values = top.map((row) => Number(row.record_count ?? row.recordCount ?? 0));
  chart.setOption({
    grid: baseGrid({ left: 12 }),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15, 23, 42, 0.92)', textStyle: { color: BRAND.text } },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: BRAND.axis } }, axisLabel: { color: BRAND.axis, interval: 0, rotate: 32, fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: BRAND.grid } }, axisLabel: { color: BRAND.axis } },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: '52%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: BRAND.purple },
            { offset: 1, color: 'rgba(168, 85, 247, 0.25)' },
          ]),
        },
      },
    ],
  });
  return chart;
}

function renderUtilizationChart(el, utilization) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  const top = [...utilization]
    .map((row) => ({
      code: row.code || row.tableCode || '—',
      value: Number(row.settled_sessions_in_range ?? row.settledSessionsInRange ?? 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .reverse();
  chart.setOption({
    grid: baseGrid({ left: 12, right: 36 }),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15, 23, 42, 0.92)', textStyle: { color: BRAND.text } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: BRAND.grid } }, axisLabel: { color: BRAND.axis } },
    yAxis: { type: 'category', data: top.map((row) => row.code), axisLine: { lineStyle: { color: BRAND.axis } }, axisLabel: { color: BRAND.text, fontWeight: 600 } },
    series: [
      {
        type: 'bar',
        data: top.map((row) => row.value),
        barWidth: '56%',
        label: { show: true, position: 'right', color: BRAND.text, fontSize: 11 },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(34, 211, 238, 0.25)' },
            { offset: 1, color: BRAND.cyan },
          ]),
        },
      },
    ],
  });
  return chart;
}

import React from 'react';
import { Row, Col, Card, Statistic, Table, Tag, List, Avatar, Typography, Empty } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, TeamOutlined, FireOutlined } from '@ant-design/icons';
import { useAppStore } from '../../stores/appStore';
import type { Reservation, PlaySession, LeaderboardEntry } from '../../types';
import { formatTime, formatDurationFrom, formatWinRate, yuan } from '../../utils/format';

const { Text } = Typography;

export const DashboardPage: React.FC = () => {
  const { tables, reservations, openSessions, leaderboard, popularity, games } = useAppStore();

  const idle = tables.filter(t => t.status === 'idle').length;
  const reserved = tables.filter(t => t.status === 'reserved').length;
  const occupied = tables.filter(t => t.status === 'occupied').length;
  const activeMembers = useAppStore(s => s.members).filter(m => m.status === 'active').length;
  const totalBalance = useAppStore(s => s.members).reduce((sum, m) => sum + m.balanceCents, 0);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="空闲桌位" value={idle} prefix={<CheckCircleOutlined />} suffix="桌" valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="预约中等候" value={reserved} prefix={<ClockCircleOutlined />} suffix="桌" valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="占用中" value={occupied} prefix={<FireOutlined />} suffix="桌" valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="活跃会员" value={activeMembers} prefix={<TeamOutlined />} suffix={`人 · ${yuan(totalBalance)}`} valueStyle={{ color: '#1677ff' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card title="待处理预约" extra={<Text type="secondary">{reservations.filter(r => r.status === 'pending').length}条</Text>}>
            {reservations.filter(r => r.status === 'pending').slice(0, 6).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div><strong>#{r.id} {r.tableCode || r.tableId}</strong><div style={{ fontSize: 12, color: '#666' }}>{r.guestName} · {r.partySize}人</div></div>
                <Tag color="gold">待入场</Tag>
              </div>
            ))}
            {!reservations.filter(r => r.status === 'pending').length && <Empty description="暂无待处理预约" />}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="进行中对局" extra={<Text type="secondary">{openSessions.length}局</Text>}>
            {openSessions.slice(0, 6).map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div><strong>#{s.id} {s.tableCode}</strong><div style={{ fontSize: 12, color: '#666' }}>{s.guestName || '现场客人'} · {s.partySize}人</div></div>
                <Tag color="processing">{formatDurationFrom(s.startedAt)}</Tag>
              </div>
            ))}
            {!openSessions.length && <Empty description="暂无进行中对局" />}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="会员排行" extra={<Text type="secondary">胜率</Text>}>
            {leaderboard.slice(0, 6).map((row, i) => (
              <div key={row.playerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: '#f0f0f0', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12 }}>{i + 1}</span>
                  <Text strong>{row.displayName}</Text>
                </div>
                <Text>{row.wins}胜/{row.games}局 <Tag color="green">{formatWinRate(row.winRate)}</Tag></Text>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card title="桌游热度">
        <Row gutter={[16, 16]}>
          {games.slice(0, 6).map(game => {
            const pop = popularity.find(p => p.title === game.title);
            return (
              <Col span={4} key={game.id}>
                <Card hoverable size="small" cover={<img alt={game.title} src={game.coverImageUrl || ''} style={{ height: 120, objectFit: 'cover' }} />}>
                  <Card.Meta title={game.title} description={`${game.minPlayers}-${game.maxPlayers}人 · 近30天 ${pop?.recordCount || 0}次`} />
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>
    </div>
  );
};

import React from 'react';
import { Row, Col, Card, Table, Avatar, Tag, Empty } from 'antd';
import { useGames, useLeaderboard } from '../../hooks/useQueries';
import { useAppStore } from '../../stores/appStore';
import { formatWinRate } from '../../utils/format';
import type { Game, LeaderboardEntry } from '../../types';

export const GamesPage: React.FC = () => {
  const { data: games = [] } = useGames();
  const { data: leaderboard = [] } = useLeaderboard();
  const { popularity } = useAppStore();

  const gameColumns = [
    { title: '封面', dataIndex: 'coverImageUrl', width: 80, render: (v: string, r: Game) => <Avatar shape="square" size={56} src={v} /> },
    { title: '名称', dataIndex: 'title', render: (v: string) => <strong>{v}</strong> },
    { title: '人数', width: 80, render: (_: any, r: Game) => `${r.minPlayers}-${r.maxPlayers}人` },
    { title: '分类', dataIndex: 'category', render: (v: string) => <Tag>{v}</Tag> },
    { title: '难度', dataIndex: 'difficultyLevel', width: 60, render: (v: number) => '⭐'.repeat(v) },
    { title: '时长', dataIndex: 'avgMinutes', width: 80, render: (v: number) => `${v}分钟` },
    { title: '热度', width: 80, render: (_: any, r: Game) => {
      const pop = popularity.find(p => p.title === r.title);
      return <Tag color="volcano">{pop?.recordCount || 0}次</Tag>;
    }},
  ];

  const leaderColumns = [
    { title: '#', width: 50, render: (_: any, __: any, i: number) => <Tag>{i + 1}</Tag> },
    { title: '头像', dataIndex: 'avatarUrl', width: 56, render: (v: string) => <Avatar src={v} /> },
    { title: '昵称', dataIndex: 'displayName' },
    { title: '胜场', dataIndex: 'wins', width: 80 },
    { title: '场次', dataIndex: 'games', width: 80 },
    { title: '胜率', dataIndex: 'winRate', width: 100, render: (v: number) => <Tag color="green">{formatWinRate(v)}</Tag> },
  ];

  return (
    <Row gutter={16}>
      <Col span={16}>
        <Card title="桌游目录" extra={`共 ${games.length} 款`}>
          <Table dataSource={games} columns={gameColumns} rowKey="id" size="small" pagination={{ pageSize: 15 }} />
        </Card>
      </Col>
      <Col span={8}>
        <Card title="会员排行榜">
          <Table dataSource={leaderboard.slice(0, 10)} columns={leaderColumns} rowKey="playerId" size="small" pagination={false} />
        </Card>
      </Col>
    </Row>
  );
};

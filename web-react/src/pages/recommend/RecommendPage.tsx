import React, { useState } from 'react';
import { Row, Col, Card, InputNumber, Select, Button, List, Tag, Empty, message } from 'antd';
import { useGames, useGameRecommendations } from '../../hooks/useQueries';
import { useAppStore } from '../../stores/appStore';

export const RecommendPage: React.FC = () => {
  const { games = [], players, members } = useAppStore();
  const [partySize, setPartySize] = useState(4);
  const [minutes, setMinutes] = useState(120);
  const [playerId, setPlayerId] = useState<number | undefined>(undefined);
  const [category, setCategory] = useState('');
  const [enabled, setEnabled] = useState(false);

  const categories = [...new Set(games.map(g => g.category).filter(Boolean))];
  const { data: recommendations = [], refetch } = useGameRecommendations({
    playerId, partySize, minutes, category: category || undefined,
  }, enabled);

  const handleGenerate = async () => {
    setEnabled(true);
    await refetch();
  };

  return (
    <Card title="智能推荐" extra={<Button type="primary" onClick={handleGenerate}>生成推荐</Button>}>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <label>预约人数</label>
          <InputNumber min={1} max={20} value={partySize} onChange={v => setPartySize(v || 4)} style={{ width: '100%' }} />
        </Col>
        <Col span={6}>
          <label>预计时长(分钟)</label>
          <InputNumber min={10} max={600} step={10} value={minutes} onChange={v => setMinutes(v || 120)} style={{ width: '100%' }} />
        </Col>
        <Col span={6}>
          <label>会员偏好</label>
          <Select allowClear placeholder="不限" value={playerId} onChange={v => setPlayerId(v)} style={{ width: '100%' }} options={players.map(p => ({ value: p.id, label: p.displayName }))} />
        </Col>
        <Col span={6}>
          <label>偏好分类</label>
          <Select allowClear placeholder="不限" value={category} onChange={v => setCategory(v || '')} style={{ width: '100%' }} options={categories.map(c => ({ value: c, label: c }))} />
        </Col>
      </Row>

      {recommendations.length === 0 && enabled ? <Empty description="暂无推荐结果" /> : (
        <List
          dataSource={recommendations}
          renderItem={item => (
            <List.Item extra={<Tag color="volcano" style={{ fontSize: 16 }}>{item.score.toFixed(1)}分</Tag>}>
              <List.Item.Meta
                avatar={<img src={item.coverImageUrl || ''} alt={item.title} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6 }} />}
                title={item.title}
                description={
                  <div>
                    <div>{item.reason}</div>
                    <div style={{ marginTop: 4 }}>
                      <Tag>{item.category}</Tag>
                      <Tag>{item.minPlayers}-{item.maxPlayers}人</Tag>
                      <Tag>{item.avgMinutes}分钟</Tag>
                      <Tag>难度 {item.difficultyLevel}</Tag>
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

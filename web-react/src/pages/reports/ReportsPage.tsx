import React from 'react';
import { Row, Col, Card, Statistic, Tag, Empty } from 'antd';
import { DollarOutlined, ClockCircleOutlined, TableOutlined } from '@ant-design/icons';
import { useRevenue, useGamePopularity } from '../../hooks/useQueries';
import { useAppStore } from '../../stores/appStore';

export const ReportsPage: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const { data: revenue } = useRevenue(today);
  const { data: popularity = [] } = useGamePopularity(30);
  const { tableUtilization } = useAppStore();

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card><Statistic title="今日收入" value={revenue?.revenueYuan || 0} prefix={<DollarOutlined />} suffix="元" precision={2} />
            <div style={{ fontSize: 12, color: '#999' }}>已结算 {revenue?.settledSessions || 0} 单</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="总时长" value={revenue?.totalBilledMinutes || 0} prefix={<ClockCircleOutlined />} suffix="分钟" /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="活跃桌位" value={tableUtilization.filter(r => r.settledSessionsInRange > 0).length} prefix={<TableOutlined />} suffix="张" /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="桌游热度排行（近30天）">
            {popularity.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span><Tag>{i + 1}</Tag> {item.title}</span>
                <strong>{item.recordCount} 局</strong>
              </div>
            ))}
            {!popularity.length && <Empty />}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="桌位利用率（近30天）">
            {tableUtilization.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span><Tag>{i + 1}</Tag> {item.code}</span>
                <strong>{item.settledSessionsInRange} 次</strong>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

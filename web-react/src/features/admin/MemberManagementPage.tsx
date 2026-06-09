import React, { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Statistic, Tag, Spin, message } from 'antd';
import { UserOutlined, GiftOutlined, DollarOutlined, FireOutlined } from '@ant-design/icons';
import api from '../../services/api';

const levelColors = {
  bronze: 'default',
  silver: 'silver',
  gold: 'gold',
  platinum: 'purple',
  diamond: 'cyan',
};

const levelNames = {
  bronze: '铜牌',
  silver: '银牌',
  gold: '金牌',
  platinum: '铂金',
  diamond: '钻石',
};

export const MemberManagementPage: React.FC = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  useEffect(() => {
    fetchMembers();
    fetchStats();
  }, []);

  const fetchMembers = async (skip = 0, take = 20) => {
    try {
      setLoading(true);
      const res = await api.get('/members-mgmt/list', {
        params: { skip, take },
      });
      setMembers(res.data.data);
      setPagination(prev => ({
        ...prev,
        total: res.data.pagination.total,
        current: Math.floor(skip / take) + 1,
      }));
    } catch (err) {
      message.error('获取会员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/members-mgmt/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const columns = [
    {
      title: '会员号',
      dataIndex: 'memberNo',
      key: 'memberNo',
    },
    {
      title: '姓名',
      dataIndex: 'displayName',
      key: 'displayName',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '等级',
      dataIndex: 'membershipLevel',
      key: 'membershipLevel',
      render: (level: string) => (
        <Tag color={levelColors[level] || 'default'}>
          {levelNames[level] || level}
        </Tag>
      ),
    },
    {
      title: '积分',
      dataIndex: 'points',
      key: 'points',
      sorter: (a: any, b: any) => a.points - b.points,
    },
    {
      title: '消费金额',
      dataIndex: 'totalSpentCents',
      key: 'totalSpentCents',
      render: (amount: number) => `¥${(amount / 100).toFixed(2)}`,
    },
    {
      title: '余额',
      dataIndex: 'balanceCents',
      key: 'balanceCents',
      render: (amount: number) => `¥${(amount / 100).toFixed(2)}`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
    },
  ];

  if (loading && !stats) return <Spin />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">会员管理</h1>

      {stats && (
        <Row gutter={16} className="mb-6">
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="总会员数"
                value={stats.totalMembers}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="总消费金额"
                value={stats.totalSpent / 100}
                precision={2}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="平均消费金额"
                value={stats.avgSpent / 100}
                precision={2}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="积分总额"
                value={stats.totalPoints}
                prefix={<GiftOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {stats && (
        <Row gutter={16} className="mb-6">
          <Col xs={24} sm={12} md={4}>
            <Card size="small">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.byLevel.bronze}</div>
                <div className="text-xs text-gray-600">铜牌会员</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Card size="small">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{stats.byLevel.silver}</div>
                <div className="text-xs text-gray-600">银牌会员</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Card size="small">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.byLevel.gold}</div>
                <div className="text-xs text-gray-600">金牌会员</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Card size="small">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.byLevel.platinum}</div>
                <div className="text-xs text-gray-600">铂金会员</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Card size="small">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">{stats.byLevel.diamond}</div>
                <div className="text-xs text-gray-600">钻石会员</div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Card title="会员列表" loading={loading}>
        <Table
          columns={columns}
          dataSource={members.map((m, idx) => ({ ...m, key: m.id || idx }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: (page, pageSize) => {
              const skip = (page - 1) * pageSize;
              fetchMembers(skip, pageSize);
            },
          }}
          size="small"
        />
      </Card>
    </div>
  );
};

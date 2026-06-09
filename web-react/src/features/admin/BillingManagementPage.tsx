import React, { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Statistic, Tag, Button, Spin, message } from 'antd';
import { DollarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';

const statusMap = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
};

const statusColors = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'default',
  refunded: 'error',
};

export const BillingManagementPage: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, []);

  const fetchOrders = async (skip = 0, take = 20) => {
    try {
      setLoading(true);
      const res = await api.get('/billing-mgmt/orders', {
        params: { skip, take },
      });
      setOrders(res.data.data);
      setPagination(prev => ({
        ...prev,
        total: res.data.pagination.total,
        current: Math.floor(skip / take) + 1,
      }));
    } catch (err) {
      message.error('获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/billing-mgmt/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const handlePayOrder = async (orderId: number) => {
    try {
      await api.post(`/billing-mgmt/orders/${orderId}/pay`);
      message.success('标记为已支付');
      fetchOrders((pagination.current - 1) * pagination.pageSize, pagination.pageSize);
      fetchStats();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      render: (orderNo: string) => <span className="font-mono">{orderNo}</span>,
    },
    {
      title: '会员',
      dataIndex: 'player',
      key: 'player',
      render: (player: any) => player ? `${player.displayName} (${player.phone})` : '线客',
    },
    {
      title: '原价',
      dataIndex: 'amountCents',
      key: 'amountCents',
      render: (amount: number) => `¥${(amount / 100).toFixed(2)}`,
    },
    {
      title: '折扣',
      dataIndex: 'discountCents',
      key: 'discountCents',
      render: (discount: number) => (
        <span className="text-red-600">-¥{(discount / 100).toFixed(2)}</span>
      ),
    },
    {
      title: '实付',
      dataIndex: 'finalCents',
      key: 'finalCents',
      render: (amount: number) => (
        <span className="font-bold text-green-600">¥{(amount / 100).toFixed(2)}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status] || 'default'}>{statusMap[status] || status}</Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: any) =>
        record.status === 'pending' ? (
          <Button
            type="link"
            size="small"
            onClick={() => handlePayOrder(record.id)}
          >
            标记已支付
          </Button>
        ) : null,
    },
  ];

  if (loading && !stats) return <Spin />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">订单与计费</h1>

      {stats && (
        <Row gutter={16} className="mb-6">
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="总订单数"
                value={stats.totalOrders}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="已支付订单"
                value={stats.paidOrders}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="总收入"
                value={stats.totalRevenue / 100}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="平均订单金额"
                value={stats.avgOrderValue / 100}
                precision={2}
                prefix="¥"
              />
            </Card>
          </Col>
        </Row>
      )}

      {stats && (
        <Row gutter={16} className="mb-6">
          <Col xs={24} md={12}>
            <Card title="优惠统计">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">
                  ¥{(stats.totalDiscount / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-600 mt-2">总优惠金额</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="优惠率">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {stats.totalRevenue > 0
                    ? ((stats.totalDiscount / (stats.totalRevenue + stats.totalDiscount)) * 100).toFixed(1)
                    : 0}
                  %
                </div>
                <div className="text-sm text-gray-600 mt-2">实际优惠占比</div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Card title="订单列表" loading={loading}>
        <Table
          columns={columns}
          dataSource={orders.map((o, idx) => ({ ...o, key: o.id || idx }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: (page, pageSize) => {
              const skip = (page - 1) * pageSize;
              fetchOrders(skip, pageSize);
            },
          }}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

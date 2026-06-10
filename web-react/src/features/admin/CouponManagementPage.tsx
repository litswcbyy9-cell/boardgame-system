import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, DatePicker, Row, Col, Statistic, Tag, message, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const couponTypeMap: Record<string, string> = {
  discount_fixed: '满减',
  discount_percent: '折扣',
  newbie: '新人券',
};

const couponTypeColors: Record<string, string> = {
  discount_fixed: 'blue',
  discount_percent: 'green',
  newbie: 'orange',
};

export const CouponManagementPage: React.FC = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async (skip = 0, take = 20) => {
    try {
      setLoading(true);
      const res = await api.get('/coupons-mgmt/list', {
        params: { skip, take },
      });
      setCoupons(res.data.data);
      setPagination(prev => ({
        ...prev,
        total: res.data.pagination.total,
        current: Math.floor(skip / take) + 1,
      }));
    } catch (err) {
      message.error('获取优惠券列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async (values: any) => {
    try {
      const payload = {
        name: values.name,
        type: values.type,
        value: values.type === 'discount_percent' ? parseInt(values.value) : parseInt(values.value) * 100,
        minAmount: values.minAmount ? parseInt(values.minAmount) * 100 : 0,
        totalQty: parseInt(values.totalQty),
        startAt: values.dateRange[0].toISOString(),
        endAt: values.dateRange[1].toISOString(),
        validOn: values.validOn || 'all',
      };

      await api.post('/coupons-mgmt/create', payload);
      message.success('优惠券创建成功');
      form.resetFields();
      setIsModalVisible(false);
      fetchCoupons();
    } catch (err) {
      message.error('创建优惠券失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: any) => (
        <Tag color={couponTypeColors[type] || 'default'}>{couponTypeMap[type] || type}</Tag>
      ),
    },
    {
      title: '优惠值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number, record: any) =>
        record.type === 'discount_percent' ? `${value}%` : `¥${(value / 100).toFixed(2)}`,
    },
    {
      title: '最低消费',
      dataIndex: 'minAmount',
      key: 'minAmount',
      render: (amount: number) => `¥${(amount / 100).toFixed(2)}`,
    },
    {
      title: '发放数量',
      dataIndex: 'totalQty',
      key: 'totalQty',
    },
    {
      title: '已发放',
      dataIndex: 'usedQty',
      key: 'usedQty',
    },
    {
      title: '有效期',
      key: 'validity',
      render: (_, record: any) => (
        <span>
          {new Date(record.startAt).toLocaleDateString('zh-CN')} ~{' '}
          {new Date(record.endAt).toLocaleDateString('zh-CN')}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: any) => (
        <Button type="link" size="small">
          详情
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">优惠券管理</h1>

      <div className="mb-6">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
          创建优惠券
        </Button>
      </div>

      <Card title="优惠券列表" loading={loading}>
        <Table
          columns={columns}
          dataSource={coupons.map((c, idx) => ({ ...c, key: c.id || idx }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: (page, pageSize) => {
              const skip = (page - 1) * pageSize;
              fetchCoupons(skip, pageSize);
            },
          }}
          size="small"
        />
      </Card>

      <Modal
        title="创建优惠券"
        visible={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => setIsModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={(values: any) => handleCreateCoupon(values)}>
          <Form.Item label="优惠券名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="如：春节满100减15" />
          </Form.Item>

          <Form.Item label="优惠券类型" name="type" rules={[{ required: true }]}>
            <Select placeholder="选择类型">
              <Select.Option value="discount_fixed">满减</Select.Option>
              <Select.Option value="discount_percent">折扣</Select.Option>
              <Select.Option value="newbie">新人券</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="优惠值" name="value" rules={[{ required: true }]}>
            <Input placeholder="满减：15（元），折扣：20（%）" />
          </Form.Item>

          <Form.Item label="最低消费金额（元）" name="minAmount">
            <Input placeholder="0 为无限制" type="number" />
          </Form.Item>

          <Form.Item label="发放数量" name="totalQty" rules={[{ required: true }]}>
            <Input type="number" placeholder="100" />
          </Form.Item>

          <Form.Item label="有效期" name="dateRange" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm:ss" />
          </Form.Item>

          <Form.Item label="限制条件" name="validOn">
            <Select placeholder="全时段">
              <Select.Option value="all">全时段</Select.Option>
              <Select.Option value="weekday">工作日</Select.Option>
              <Select.Option value="weekend">周末</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

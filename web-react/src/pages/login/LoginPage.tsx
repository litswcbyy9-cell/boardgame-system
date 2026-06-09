import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Tabs, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAppStore } from '../../stores/appStore';
import { clearAuthToken } from '../../services/api';

const { Title } = Typography;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, refreshAll } = useAppStore();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      await refreshAll();
      navigate('/');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: { username: string; password: string; displayName: string }) => {
    setLoading(true);
    try {
      await register(values.username, values.password, values.displayName);
      message.success('账号已创建');
      await refreshAll();
      navigate('/');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>骰子猫桌游馆</Title>
          <Typography.Text type="secondary">运营工作台</Typography.Text>
        </div>
        <Tabs activeKey={tab} onChange={setTab} centered items={[
          {
            key: 'login', label: '登录',
            children: (
              <Form onFinish={handleLogin} size="large">
                <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
                  <Input prefix={<UserOutlined />} placeholder="账号" />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
                </Form.Item>
              </Form>
            ),
          },
          ...(import.meta.env.VITE_ALLOW_PUBLIC_REGISTER !== '0' ? [{
            key: 'register', label: '注册',
            children: (
              <Form onFinish={handleRegister} size="large">
                <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }, { pattern: /^[a-zA-Z0-9_]{3,32}$/, message: '3-32位字母数字下划线' }]}>
                  <Input prefix={<UserOutlined />} placeholder="账号" />
                </Form.Item>
                <Form.Item name="displayName" rules={[{ required: true, message: '请输入显示名称' }]}>
                  <Input placeholder="显示名称" />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>注册并进入</Button>
                </Form.Item>
              </Form>
            ),
          }] : []),
        ]} />
      </Card>
    </div>
  );
};

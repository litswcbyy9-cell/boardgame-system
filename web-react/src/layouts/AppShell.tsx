import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Button, Dropdown, Spin, Tag, Typography, Badge } from 'antd';
import {
  DashboardOutlined, TableOutlined, TeamOutlined, UserOutlined,
  TrophyOutlined, PlayCircleOutlined, BarChartOutlined,
  ExperimentOutlined, LogoutOutlined, ReloadOutlined, ShopOutlined,
} from '@ant-design/icons';
import { useAppStore, useCurrentUser, useIsAdmin } from '../stores/appStore';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '运营总览' },
  { key: 'tables', icon: <TableOutlined />, label: '桌位预约' },
  { key: 'members', icon: <TeamOutlined />, label: '会员管理' },
  { key: 'staff', icon: <UserOutlined />, label: '员工管理' },
  { key: 'games', icon: <TrophyOutlined />, label: '桌游目录' },
  { key: 'sessions', icon: <PlayCircleOutlined />, label: '对局战绩' },
  { key: 'recommend', icon: <ExperimentOutlined />, label: '智能推荐' },
  { key: 'reports', icon: <BarChartOutlined />, label: '数据报表' },
];

const statusMap: Record<string, { color: string; text: string }> = {
  idle: { color: 'green', text: '空闲' },
  reserved: { color: 'gold', text: '预约' },
  occupied: { color: 'red', text: '占用' },
};

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  const isAdmin = useIsAdmin();
  const { activePage, setActivePage, logout, refreshAll, loading, error, venue, tables, reservations, openSessions, games } = useAppStore();

  const activeRoute = location.pathname.replace('/', '') || 'dashboard';

  useEffect(() => {
    refreshAll();
  }, []);

  const handleMenuClick = (info: { key: string }) => {
    setActivePage(info.key as any);
    navigate(`/${info.key === 'dashboard' ? '' : info.key}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const counts = {
    idle: tables.filter(t => t.status === 'idle').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    pendingReservations: reservations.filter(r => r.status === 'pending').length,
  };

  const userMenu = {
    items: [
      { key: 'role', label: `角色：${user?.role === 'admin' ? '管理员' : '店员'}`, disabled: true },
      { key: 'staff', label: `员工号：${user?.employeeNo || '未绑定'}`, disabled: true },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: async (info: { key: string }) => {
      if (info.key === 'logout') await handleLogout();
    },
  };

  if (loading && !tables.length) {
    return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }} />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="dark" style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar src={venue?.logoUrl} icon={<ShopOutlined />} size={40} shape="square" />
          <div>
            <Text strong style={{ color: '#fff', fontSize: 15, display: 'block' }}>{venue?.name || '骰子猫桌游馆'}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>运营工作台</Text>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeRoute]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0 }}
        />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
          background: 'rgba(255,255,255,0.05)', margin: 12, borderRadius: 8,
        }}>
          {error && <Text style={{ color: '#ff4d4f', fontSize: 12, display: 'block' }}>{error}</Text>}
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            v1.1.0 · {counts.idle}空闲 {counts.reserved}预约 {counts.occupied}占用
          </Text>
        </div>
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Text strong style={{ fontSize: 16, marginRight: 12 }}>
              {menuItems.find(m => m.key === activeRoute)?.label || '运营总览'}
            </Text>
            <Tag color="blue">今日预约 {counts.pendingReservations}</Tag>
            <Tag color="orange">进行中 {counts.occupied}</Tag>
            <Tag color="purple">桌游库 {games.length}</Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} size="small" loading={loading}>刷新</Button>
            <Dropdown menu={userMenu} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} size="small" style={{ backgroundColor: isAdmin ? '#722ed1' : '#1677ff' }} />
                <span>{user?.staffName || user?.displayName || user?.username}</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 24 }}>
          {error && (
            <div style={{ marginBottom: 16, padding: '8px 16px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6 }}>
              <Text type="danger">{error}</Text>
            </div>
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

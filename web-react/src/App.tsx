import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/login/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { TablesPage } from './pages/tables/TablesPage';
import { MembersPage } from './pages/members/MembersPage';
import { StaffPage } from './pages/staff/StaffPage';
import { GamesPage } from './pages/games/GamesPage';
import { SessionsPage } from './pages/sessions/SessionsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { RecommendPage } from './pages/recommend/RecommendPage';
import { CustomerPage } from './pages/customer/CustomerPage';
import { MemberManagementPage } from './features/admin/MemberManagementPage';
import { CouponManagementPage } from './features/admin/CouponManagementPage';
import { BillingManagementPage } from './features/admin/BillingManagementPage';
import { useAppStore } from './stores/appStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 },
  },
});

// 路由守卫
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, authLoading, checkAuth } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  if (authLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
};

// 公开路由：顾客预约
const PublicShell: React.FC = () => {
  useEffect(() => {
    useAppStore.getState().checkAuth(); // 可选登录
  }, []);
  return <CustomerPage />;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/booking" element={<PublicShell />} />
    <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
      <Route index element={<DashboardPage />} />
      <Route path="tables" element={<TablesPage />} />
      <Route path="members" element={<MembersPage />} />
      <Route path="staff" element={<StaffPage />} />
      <Route path="games" element={<GamesPage />} />
      <Route path="sessions" element={<SessionsPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="recommend" element={<RecommendPage />} />
      <Route path="admin/members" element={<MemberManagementPage />} />
      <Route path="admin/coupons" element={<CouponManagementPage />} />
      <Route path="admin/billing" element={<BillingManagementPage />} />
    </Route>
  </Routes>
);

const App: React.FC = () => (
  <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#8f2347', borderRadius: 8 } }}>
    <AntApp>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </AntApp>
  </ConfigProvider>
);

export default App;

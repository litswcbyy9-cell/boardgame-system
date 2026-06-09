# 桌游门店运营系统 — 企业级可售卖架构设计方案

## Context

**当前项目**：骰子猫桌游馆运营工作台 (Dice Cat Boardgame Ops) — 一个桌游桌位预约、开台计费、会员管理与战绩记录的SaaS雏形。现有技术栈为 Express.js 单体API + Vanilla JS SPA + MySQL 8 存储过程 + Electron 桌面壳。

**目标**：将其重构为企业级、可售卖的SaaS产品，从单店工具升级为多租户连锁桌游馆运营平台，覆盖门店运营全链路（获客→预约→到店→开台→计费→战绩→营销→分析），支持Web后台、微信小程序、顾客自助端、POS收银端四端协同。

**参照产品**：
- 美团·休闲娱乐SaaS — 预约管理、团购核销、会员营销
- Board Game Arena (BGA.com) — 桌游对战记录、ELO排名
- 美味不用等 — 排队叫号、远程取号
- 客如云 / 哗啦啦 — 餐饮SaaS收银与会员
- Shopify — 多租户SaaS架构范式

---

## 一、总体架构拓扑

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         客户端层 (Client Layer)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Web 后台  │  │ 微信小程序 │  │ 顾客H5端  │  │ POS 收银  │  │ 电子桌牌  │ │
│  │ (React)  │  │ (WeChat)  │  │ (Mobile)  │  │ (Electron)│  │ (Android) │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼────────┘
        │             │             │             │             │
┌───────┴─────────────┴─────────────┴─────────────┴─────────────┴────────┐
│                       网关与接入层 (Gateway)                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Kong / APISIX API Gateway                                       │  │
│  │  - 路由 & 限流  - 鉴权 & JWT校验  - 日志  - 灰度/金丝雀           │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴──────────────────────────────────────┐
│                       微服务层 (Microservices)                          │
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 用户与租户 │ │ 预约引擎  │ │ 桌台调度  │ │ 计费结算  │ │ 战绩排行  │    │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │ Service  │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │            │            │            │            │            │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐    │
│  │ 营销活动  │ │ 消息通知  │ │ 库存管理  │ │ 报表分析  │ │ 集成网关  │    │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │ Service  │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘    │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼────────┘
        │             │             │             │             │
┌───────┴─────────────┴─────────────┴─────────────┴─────────────┴────────┐
│                       中间件层 (Middleware)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │  Redis   │ │ RabbitMQ  │ │  Elastic  │ │  MinIO   │ │  Nacos   │    │
│  │  缓存    │ │  消息队列  │ │  Search  │ │ 对象存储  │ │ 配置中心  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
└────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴──────────────────────────────────────┐
│                       数据层 (Data Layer)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐  │
│  │  MySQL   │ │ ClickHouse│ │  MongoDB  │ │  Datalake (Hive/Iceberg)│  │
│  │  OLTP   │ │  OLAP    │ │ 日志/行为  │ │  离线数仓                │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、后端架构重构：从单体到模块化微服务

### 2.1 技术栈选型

| 层次 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js 20 LTS | 团队现有技能延续，非阻塞IO适合预约并发 |
| 框架 | NestJS | TypeScript原生、模块化、依赖注入、OpenAPI自动生成、对标Spring Boot |
| ORM | Prisma / Drizzle | 类型安全、迁移管理、取代裸SQL |
| RPC | gRPC (内网) + REST (外网) | 服务间高性能通信 + 外部标准REST |
| 数据库 | MySQL 8.0 (OLTP) + ClickHouse (OLAP) | MySQL做业务事务，ClickHouse做报表分析 |
| 缓存 | Redis Cluster | 分布式缓存 + 分布式锁（预约防超卖） |
| 消息队列 | RabbitMQ | 异步任务：预约到期自动取消、短信通知、结算对账 |
| 对象存储 | MinIO / 阿里云OSS | 桌游封面、规则书PDF、门店实景图 |
| 搜索引擎 | Elasticsearch | 桌游全文检索、会员模糊搜索、日志检索 |
| 配置中心 | Nacos / Apollo | 多租户动态配置、功能开关 |
| 服务注册 | Nacos | 服务发现与健康检查 |
| API网关 | Kong / APISIX | 限流、鉴权、路由、日志、灰度发布 |

### 2.2 微服务拆分（9个核心服务）

```
├── gateway/                    # API 网关 (Kong/APISIX 配置)
│
├── services/
│   ├── user-service/           # 用户与租户服务
│   │   ├── 租户管理 (多门店/连锁)
│   │   ├── 员工档案 & RBAC
│   │   ├── 后台账号 & JWT签发
│   │   └── 操作审计日志
│   │
│   ├── reservation-service/    # 预约服务 (核心)
│   │   ├── 预约创建/修改/取消
│   │   ├── 时段冲突检测 (分布式锁)
│   │   ├── 预约超时自动取消 (延迟队列)
│   │   ├── 排队叫号 & 远程取号
│   │   └── 预约日历 & 容量规划
│   │
│   ├── table-service/          # 桌台调度服务
│   │   ├── 桌位CRUD & 平面图管理
│   │   ├── 实时桌态管理 (idle/reserved/occupied)
│   │   ├── 智能桌位推荐引擎
│   │   └── 拼桌/拆桌支持
│   │
│   ├── billing-service/        # 计费与结算服务
│   │   ├── 多费率策略 (按时/按人/包段/套餐)
│   │   ├── 会员余额支付
│   │   ├── 微信支付 / 支付宝集成
│   │   ├── 团购券核销 (美团/点评)
│   │   ├── 账单 & 退款管理
│   │   └── 日结/月结对账
│   │
│   ├── game-service/           # 桌游与战绩服务
│   │   ├── 桌游目录管理 (CRUD + 分类)
│   │   ├── 游戏推荐引擎
│   │   ├── 战绩录入 & ELO/积分排名
│   │   ├── 成就 & 徽章系统
│   │   └── 库存管理 (实体桌游借出/归还)
│   │
│   ├── member-service/         # 会员服务
│   │   ├── 会员档案 & 等级体系
│   │   ├── 会员卡 & 储值管理
│   │   ├── 积分 & 成长值
│   │   ├── 会员标签 & 画像
│   │   └── 充值/消费流水
│   │
│   ├── marketing-service/      # 营销服务
│   │   ├── 优惠券/代金券
│   │   ├── 拼团/秒杀活动
│   │   ├── 会员日活动
│   │   ├── 裂变分销 (邀请有礼)
│   │   └── 生日营销自动化
│   │
│   ├── notification-service/   # 消息通知服务
│   │   ├── 短信 (阿里云/腾讯云)
│   │   ├── 微信模板消息/订阅消息
│   │   ├── 邮件通知
│   │   ├── App Push (极光/个推)
│   │   └── 通知模板管理
│   │
│   └── analytics-service/      # 数据分析服务
│       ├── 实时经营大屏 (WebSocket)
│       ├── 收入/客流/转化报表
│       ├── 员工绩效报表
│       ├── 桌游热度 & ROI分析
│       └── 数据导出 (Excel/PDF)
│
├── libs/                       # 共享库
│   ├── common/                 # 公共DTO/工具/常量
│   ├── database/               # 数据库连接池封装
│   ├── auth/                   # JWT & RBAC 中间件
│   ├── cache/                  # Redis 工具封装
│   └── logger/                 # 结构化日志 (Winston/Pino)
```

### 2.3 从现有代码到微服务的迁移映射

| 现有代码 (`server/src/index.js`) | 迁移目标 |
|----------------------------------|---------|
| `/api/auth/*` (login/register/me/logout) | `user-service` |
| `/api/staff/*` | `user-service` |
| `/api/members/*` | `member-service` |
| `/api/reservations/*` + `/api/public/reservations` | `reservation-service` |
| `/api/tables/*` + `/api/sessions/*` | `table-service` + `billing-service` |
| `/api/games/*` + `/api/leaderboard` | `game-service` |
| `/api/reports/*` | `analytics-service` |
| `/api/recommendations/*` | `game-service` + `table-service` |
| `/api/health` | 各服务独立健康检查 |

---

## 三、数据库架构升级

### 3.1 核心变更

```sql
-- 保留现有12表的精华设计，在此基础上扩展

-- 1. 多租户改造：所有业务表加 tenant_id
ALTER TABLE venues ADD COLUMN tenant_id INT UNSIGNED;
-- tenant_id → venues(id) 构成租户隔离

-- 2. 新增核心表
CREATE TABLE tenants (           -- 租户/连锁品牌
  id, name, contact, plan_type,  -- plan: free/basic/pro/enterprise
  status, created_at, expired_at
);

CREATE TABLE subscription_plans ( -- SaaS定价方案
  id, name, price_per_month, max_venues, max_staff,
  max_tables, features_json
);

CREATE TABLE recharge_orders (    -- 充值订单
  id, member_id, amount_cents, payment_method,
  transaction_id, status, created_at
);

CREATE TABLE coupons (            -- 优惠券
  id, tenant_id, name, type, value, min_amount,
  total_qty, used_qty, start_at, end_at
);

CREATE TABLE member_coupons (     -- 会员领券记录
  id, member_id, coupon_id, status, used_at
);

CREATE TABLE audit_logs (         -- 审计日志
  id, tenant_id, user_id, action, resource_type,
  resource_id, old_value_json, new_value_json, ip, created_at
);

CREATE TABLE notification_logs (  -- 通知发送记录
  id, tenant_id, channel, recipient, template_id,
  content, status, sent_at
);

CREATE TABLE game_inventory (     -- 桌游库存(实体)
  id, tenant_id, game_id, barcode, status, condition, location
);

CREATE TABLE game_ratings (       -- 游戏评分
  id, player_id, game_id, rating, review, created_at
);

-- 3. 现有表增强
-- reservations: 加 source (walkin/wechat/phone/meituan), coupon_id
-- play_sessions: 加 payment_method, discount_cents, invoice_status
-- players: 加 openid (微信), unionid, membership_level, points, birthday
-- game_tables: 加 hourly_rate_cents, min_duration, max_duration, tags
-- games: 加 bgg_id, publisher, publish_year, weight, tags, status (in_stock/lent)
```

### 3.2 数据分层策略

```
OLTP (MySQL 8.0)          OLAP (ClickHouse)         Search (ES)
───────────────           ─────────────────         ──────────
tenants                   dwd_revenue_daily         桌游搜索索引
venues                    dwd_reservation_flow      会员搜索索引
reservations              dwd_game_play_stats       日志全文检索
play_sessions             dwd_member_profile
billing records           ads_store_dashboard
members                   ads_game_ranking
game_records              ads_employee_performance
```

---

## 四、前端架构升级

### 4.1 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| Web后台框架 | **React 18 + TypeScript** | 生态最成熟、Ant Design组件库支持最佳 |
| UI组件库 | **Ant Design Pro** | 企业级中后台标准、开箱即用 |
| 状态管理 | **Zustand** | 轻量、TS友好、替代Redux |
| 路由 | **React Router v6** | 标准方案 |
| 请求库 | **TanStack Query (React Query)** | 服务端状态管理、缓存、自动刷新 |
| 构建工具 | **Vite 5** | 保留现有Vite生态 |
| 图表 | **ECharts / AntV** | 经营数据可视化 |
| 微信小程序 | **Taro 3.x (React)** | 一套代码多端编译 |
| 移动端H5 | **Ant Design Mobile** | 顾客自助端 |

### 4.2 页面架构重构

```
web/src/
├── app/                       # App入口
│   ├── App.tsx
│   ├── router.tsx             # 路由配置
│   └── providers/             # QueryClient, Auth, Theme
├── features/                  # 功能模块 (Feature-based)
│   ├── auth/                  # 登录/注册/SSO
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── auth.store.ts
│   ├── dashboard/             # 运营总览
│   │   ├── DashboardPage.tsx
│   │   └── components/
│   │       ├── MetricCards.tsx
│   │       ├── ReservationList.tsx
│   │       ├── ActiveSessions.tsx
│   │       └── Leaderboard.tsx
│   ├── tables/                # 桌位管理
│   │   ├── TableFloorPage.tsx
│   │   ├── TableBookingPage.tsx
│   │   └── components/
│   │       ├── FloorGrid.tsx
│   │       ├── TableCard.tsx
│   │       ├── ReservationForm.tsx
│   │       └── SettlementForm.tsx
│   ├── members/               # 会员管理
│   ├── staff/                 # 员工管理
│   ├── games/                 # 桌游目录 & 库存
│   ├── sessions/              # 对局 & 战绩
│   ├── billing/               # 计费 & 账单
│   ├── marketing/             # 营销 & 优惠券
│   ├── reports/               # 报表 & 大屏
│   └── settings/              # 门店设置 (tenant)
├── shared/                    # 共享组件
│   ├── components/            # UI组件
│   ├── hooks/                 # 通用hooks
│   ├── utils/                 # 工具函数
│   ├── types/                 # TypeScript类型
│   └── api/                   # API客户端封装
├── layouts/                   # 布局组件
└── styles/                    # 全局样式 & 主题
```

### 4.3 微信小程序架构

```
miniapp/
├── pages/
│   ├── index/                 # 首页 (附近门店/推荐桌游)
│   ├── booking/               # 预约桌位
│   ├── games/                 # 桌游浏览 & 评分
│   ├── member/                # 会员中心 (余额/积分/战绩)
│   ├── orders/                # 订单列表
│   └── queue/                 # 排队取号
├── components/
├── services/                  # API调用
└── utils/
```

---

## 五、核心业务深度设计

### 5.1 智能预约引擎（参照美团·到店预约）

```
预约流程:
1. 用户选择: 门店 → 日期 → 人数 → 桌位偏好(标准/包间/聚会区)
2. 系统计算: 
   - 容量匹配 (人数 vs 桌位capacity)
   - 时段可用性 (冲突检测 → 无冲突时段slot推荐)
   - 历史偏好 (会员最常玩桌游所需的推荐人数)
3. 锁定资源:
   - Redis SETNX 锁定桌位×时段 (10分钟预留)
   - 用户确认 → DB写入 + 释放Redis锁
   - 超时未确认 → 锁自动过期释放
4. 预约确认:
   - 短信/微信消息推送预约成功通知
   - 到店前30分钟提醒
   - 超时15分钟未签到 → 自动取消 + 释放桌位
```

### 5.2 多维度计费引擎

```
计费模式配置 (per venue):
├── 按时计费 (×元/小时, 按分钟粒度)
├── 按人计费 (×元/人/小时)
├── 包段计费 (工作日白天×元不限时)
├── 套餐计费 (×元含N小时+饮品+指定桌游)
├── 会员折扣 (等级折扣 + 优惠券叠加)
├── 拼桌分摊 (AA制计算)
└── 特殊时段 (节假日浮动定价)
```

### 5.3 桌游推荐 & 排名系统

```
推荐信号 (参照BGA):
├── 人数匹配度 (party_size vs min/max_players) × 0.25
├── 时长匹配度 (预计时长 vs avg_minutes) × 0.15
├── 类型偏好 (category matching) × 0.15
├── 会员历史 (played / won history) × 0.20
├── 近期热度 (recent 30-day plays) × 0.15
├── 运营权重 (门店推荐) × 0.10
└── 评分 (game_ratings avg) × 额外因子

排名算法:
├── ELO Rating (双人对战)
├── Win Rate (胜率排行)
├── 积分制 (参与+胜利积分)
└── 成就系统 (里程碑徽章)
```

### 5.4 营销引擎

```
├── 优惠券引擎
│   ├── 满减券 (满100减20)
│   ├── 折扣券 (8折, 最高减50)
│   ├── 时段券 (工作日下午可用)
│   ├── 新人券 (首次消费立减)
│   └── 裂变券 (分享得券)
│
├── 会员等级
│   ├── 青铜 (注册)
│   ├── 白银 (累计消费500)
│   ├── 黄金 (累计消费2000)
│   ├── 铂金 (累计消费5000)
│   └── 钻石 (累计消费10000)
│
├── 积分体系
│   ├── 消费积分 (1元=1积分)
│   ├── 签到积分
│   ├── 战绩积分 (每局+5)
│   └── 积分兑换 (券/周边/免费时数)
│
└── 自动化营销
    ├── 生日营销 (生日当天免费1小时)
    ├── 沉睡唤醒 (30天未到店 → 推送优惠券)
    └── 节日活动 (元旦/国庆/店庆模板)
```

---

## 六、部署与运维

### 6.1 容器化编排

```yaml
# docker-compose.prod.yml (简化示意)
services:
  # 基础设施
  mysql-master:       # MySQL 8.0 主库
  mysql-replica:      # MySQL 只读副本
  redis-cluster:      # Redis 7.x Cluster (3主3从)
  rabbitmq:           # RabbitMQ 3.x
  elasticsearch:      # ES 8.x
  clickhouse:         # ClickHouse 分析库
  minio:              # 对象存储
  nacos:              # 配置中心 + 服务注册
  
  # 微服务 (每个2副本)
  user-service:       ×2
  reservation-service: ×2
  table-service:      ×2
  billing-service:    ×2
  game-service:       ×2
  member-service:     ×2
  marketing-service:  ×2
  notification-service: ×2
  analytics-service:  ×2
  
  # 网关
  apisix:             # API Gateway
  
  # 前端
  web-admin:          # Nginx + React SPA
  web-customer:       # Nginx + H5
```

### 6.2 Kubernetes生产部署

```
集群规模:
├── 3 Control Plane Nodes
├── 6 Worker Nodes (混合部署)
├── 1 GPU Node (可选: AI推荐模型)
│
命名空间:
├── infrastructure   (MySQL, Redis, ES, MQ)
├── platform        (Nacos, APISIX, logging, monitoring)
├── services        (所有微服务)
└── frontend        (所有前端应用)
│
CI/CD:
├── GitLab CI / GitHub Actions
├── 构建 → 单元测试 → 镜像 → 推送Harbor
├── 部署: ArgoCD / Flux (GitOps)
└── 灰度: APISIX canary release (10%→50%→100%)
```

### 6.3 可观测性栈

```
├── 日志:    Filebeat → Elasticsearch → Kibana
├── 指标:    Prometheus + Grafana (JVM/Node指标, 业务指标)
├── 链路追踪: OpenTelemetry → Jaeger
├── 告警:    AlertManager → 钉钉/飞书/企业微信
├── 健康检查: Kubernetes Liveness/Readiness Probe
└── 业务大盘: Grafana Dashboard (GMV/订单/预约/开台率)
```

---

## 七、安全架构

| 层面 | 措施 |
|------|------|
| 传输层 | TLS 1.3 全链路HTTPS, WebSocket over WSS |
| 认证 | JWT (Access 15min + Refresh 7day), 双因素认证(可选) |
| 授权 | RBAC (admin/manager/staff/cashier/analyst), 租户数据隔离 |
| API安全 | APISIX限流 (100req/s per IP), 参数校验 (class-validator), SQL注入防护 (参数化查询) |
| 数据安全 | 密码 scrypt 哈希, 手机号加密存储, PII数据脱敏, 数据库TDE加密 |
| 审计 | 所有写操作记录 audit_logs, 登录IP/设备记录 |
| 合规 | 用户隐私协议, 数据导出/删除 (GDPR/个人信息保护法) |
| 支付安全 | PCI DSS合规, 支付密钥托管密钥管理服务, 支付回调签名验证 |
| 微信安全 | 微信服务器IP白名单校验, 消息加密 |

---

## 八、SaaS多租户与商业化

### 8.1 定价方案 (Subscription Plans)

| 方案 | 月费 | 门店数 | 员工数 | 桌位数 | 特色功能 |
|------|------|--------|--------|--------|---------|
| Free | ¥0 | 1 | 3 | 10 | 基础预约+计费 |
| Basic | ¥299 | 1 | 10 | 30 | +会员管理+基础报表 |
| Pro | ¥999 | 5 | 50 | 100 | +微信小程序+营销+高级报表 |
| Enterprise | ¥定制 | 不限 | 不限 | 不限 | +连锁管理+BI+API开放+私有部署 |

### 8.2 增值服务

```
├── 短信包 (¥0.05/条, 预购套餐)
├── 高级培训 (¥2999/次 上门培训)
├── 定制开发 (¥2000/人天)
├── 数据迁移 (¥5000/次)
└── 代运营服务 (¥1999/月)
```

---

## 九、分阶段实施路线图

### Phase 1: 地基 (4周) — 等价于 MVP 重构
- [ ] NestJS 项目初始化 + 单体模块化 (monorepo with shared libs)
- [ ] 多租户数据库改造 (tenant_id + 行级安全)
- [ ] JWT + RBAC 认证授权
- [x] API 版本化 (`/api/v1/...`)
- [ ] 请求校验 (class-validator + DTO)
- [x] 结构化日志 (JSON access logs，后续可接 Winston/Pino)
- [x] 操作审计日志
- [ ] Docker Compose 完整部署
- [ ] 前端 React + Ant Design Pro 骨架搭建
- [ ] 迁移现有7个页面的所有功能到 React

### Phase 2: 商业化 (4周)
- [ ] 租户管理 (注册/开通/续费)
- [ ] 订阅方案 & 支付 (微信支付/支付宝)
- [ ] Redis 缓存层 (桌位状态、推荐结果)
- [ ] 消息队列 + 通知服务 (短信/微信模板消息)
- [ ] 微信小程序 MVP (预约 + 会员中心)
- [ ] 优惠券引擎
- [ ] 会员等级 & 积分

### Phase 3: 规模化 (4周)
- [ ] 微服务拆分 (从单体拆分出核心3-5个服务)
- [ ] API Gateway (APISIX)
- [ ] 搜索 (ES集成)
- [ ] ClickHouse 数据分析
- [ ] 实时经营大屏 (WebSocket)
- [ ] 多维度计费引擎
- [ ] 桌游库存管理
- [ ] CI/CD 流水线

### Phase 4: 精细化 (持续)
- [ ] AI 推荐模型优化 (协同过滤 + embedding)
- [ ] 多门店连锁管理
- [ ] POS 收银端 (Electron v2)
- [ ] 电子桌牌 (Android 平板)
- [ ] 美团/点评团购核销
- [ ] 数据中台 (离线数仓)
- [ ] 国际化 i18n
- [ ] 性能优化 & 全链路压测

---

## 十、推荐实施路径：先"模块化单体"后"微服务"

**关键判断**：当前阶段不应直接拆分为9个微服务。理由：
1. 团队规模未知，微服务运维成本高
2. 产品还在PMF（Product-Market Fit）探索期，功能迭代需快速
3. 参照成熟经验：美团到店最早也是单体，做到日均千万订单后才拆分

**推荐路径**：模块化单体 → 垂直拆分 → 水平微服务

```
现在 ──→ Phase 1-2: NestJS 模块化单体
         (清晰的模块边界 + 共享lib，但部署为一个进程)
         │
         ├ 模块间用 TypeScript interface 定义合约
         ├ 数据库仍共享(分库便于后续拆分)
         └ 达到月活门店>50家或日均订单>1000后
              │
              ↓
         Phase 3: 拆分核心服务
         (预约 → 计费 → 会员 各自独立部署)
              │
              ↓
         Phase 4: 全微服务 (必要时)
```

---

## 十一、验证计划

### 11.1 功能验证
- 多租户：创建2个租户，各自管理门店、互不干扰
- 预约流程：创建预约→冲突检测→签到→计费→结算→关台
- 并发测试：同一桌位时段，2个请求同时预约，验证分布式锁
- 支付流程：充值→消费→退款全链路
- 微信小程序：预约→查询→取消完整闭环

### 11.2 非功能验证
- 压力测试：JMeter 模拟 1000 并发预约请求
- 数据一致性：关台结算后金额与报表一致
- 性能基准：API P99 < 200ms (不含数据库)
- 可用性：服务重启后预约状态正确恢复

### 11.3 现有功能回归
- 保留现有 test seed data，确保所有接口行为向后兼容
- 旧版 API 路径保留 `/api/*` → 新版 `/api/v1/*` 共存

---

## 十二、关键风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 微信小程序审核不通过 | 无法获客 | 先上线H5顾客端，小程序并行推进 |
| MySQL存储过程迁移复杂 | 重构周期长 | 存储过程逐步迁移到应用层，新功能直接用ORM |
| 微服务拆太细运维困难 | 团队压力大 | 严格遵循"模块化单体优先"策略 |
| 支付合规风险 | 法律问题 | 使用持牌支付服务商(微信/支付宝)，不碰资金池 |
| 数据迁移出错 | 客户数据丢失 | 灰度迁移 + 双写 + 数据校验 |

---

## 附录A：与成熟产品的对标矩阵

| 功能域 | 骰子猫(当前) | 骰子猫(目标) | 美团到店 | BGA | 客如云 |
|--------|-------------|-------------|---------|-----|--------|
| 预约管理 | ✓ 基础 | ✓✓ 智能推荐+排队 | ✓✓✓ | - | ✓✓✓ |
| 桌位管理 | ✓ 平面图 | ✓✓ 实时+拼桌 | ✓✓ | - | ✓✓ |
| 会员体系 | ✓ 基础 | ✓✓ 等级+积分+标签 | ✓✓✓ | - | ✓✓✓ |
| 计费结算 | ✓ 固定费率 | ✓✓ 多策略+支付 | ✓✓✓ | - | ✓✓✓ |
| 战绩排行 | ✓ 胜率 | ✓✓ ELO+成就 | - | ✓✓✓ | - |
| 游戏推荐 | ✓ 评分模型 | ✓✓ AI协同过滤 | - | ✓✓ | - |
| 微信小程序 | ✗ | ✓✓ | ✓✓✓ | - | ✓✓✓ |
| 多门店连锁 | ✗ | ✓✓ | ✓✓✓ | - | ✓✓✓ |
| 数据大屏 | ✗ | ✓✓ | ✓✓ | - | ✓✓ |
| 团购核销 | ✗ | ✓ | ✓✓✓ | - | ✓✓ |

## 附录B：技术债务清理清单
- [ ] 从 CommonJS (`require`) 迁移到 ESM (`import`)
- [ ] 从裸 SQL 迁移到 Prisma/Drizzle ORM
- [ ] 从 `mysql2` 直连迁移到连接池 + 读写分离
- [ ] 从 console.log 迁移到结构化日志 (Pino/Winston)
- [ ] 从单文件1107行拆分到模块化
- [ ] 添加 TypeScript 类型覆盖
- [ ] 添加单元测试 + E2E测试

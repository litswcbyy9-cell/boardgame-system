# boardgame-system

单店版桌游馆经营系统，保留 Express + Vanilla JS/Vite + MySQL + Docker/Caddy 技术栈。

## Current Scope

- 顾客端：首页预约、顾客注册登录、我的预约、战绩填写、桌游目录、排行榜、租借展示、AI 咨询。
- 后台端：运营总览、桌位预约/入场/结算、会员管理、员工与权限、桌游目录、租借管理、报表。
- AI 助手：只读允许的数据，不直接执行预约、取消、结算、账号修改等写操作。
- 部署：Caddy + Web + API + MySQL，`/` 进入顾客端，`/admin` 进入后台。

## Architecture

```text
server/src/index.js          Express 入口：中间件、路由挂载、静态资源、监听端口
server/src/routes/           按业务域拆分的 API 路由
server/src/services/         可复用业务服务，例如预约流程、AI 边界策略
server/src/middleware/       安全、限流、统一错误处理
server/src/ops.js            健康检查与迁移状态
web/src/main.js              Vanilla JS SPA 主流程
web/src/app-data.js          前端常量、导航、演示数据、错误文案
web/src/state.js             前端初始状态
web/src/components/          可复用前端组件
scripts/                     备份、数据库检查、部署前检查、E2E 冒烟
db/init + db/migrations      初始化 SQL 与可记录迁移
```

## Common Commands

```bash
npm install
npm run build
npm test
npm run db:check
npm run deploy:check
E2E_BASE_URL=https://lhywork.top npm run test:e2e
```

## Production Update

```bash
cd /opt/boardgame-system
git pull origin main
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
npm run deploy:prod:migrate
curl -s https://lhywork.top/api/health
```

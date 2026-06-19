# VS Code / Visual Studio 运行指南

本项目是 Node.js + Express + Vite + MySQL 项目，不是 .NET 项目。推荐使用 VS Code；Visual Studio 也可以打开文件夹并通过终端运行。

## 1. 准备环境

需要安装：

- Node.js LTS，建议 20 或更高版本。
- MySQL 8。
- VS Code 或 Visual Studio。

检查命令：

```powershell
node -v
npm -v
mysql --version
```

## 2. 初始化数据库

如果本机还没有 `boardgame` 数据库，在项目根目录运行：

```powershell
cd E:\boardgame-system
powershell -ExecutionPolicy Bypass -File .\db\setup-local.ps1 -AdminPassword "你的MySQL root密码"
```

如果想清空并重建演示数据库：

```powershell
powershell -ExecutionPolicy Bypass -File .\db\setup-local.ps1 -AdminPassword "你的MySQL root密码" -ResetDatabase
```

默认后端连接配置：

```env
PORT=8788
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=boardgame
DB_PASSWORD=boardgame
DB_NAME=boardgame
SERVE_WEB=1
```

如果 `server/.env` 不存在，复制一份：

```powershell
Copy-Item .\server\.env.example .\server\.env
```

注意：`server/.env` 里可以放大模型 API Key，不要截图展示，也不要提交到 Git。

## 3. VS Code 推荐运行方式

### 3.1 打开项目

1. 打开 VS Code。
2. 选择 `File -> Open Folder...`。
3. 打开 `E:\boardgame-system`。
4. 打开 VS Code 终端：`Terminal -> New Terminal`。

首次运行先安装依赖：

```powershell
npm install
```

### 3.2 开发模式

开发模式会同时启动：

- 后端 API：`http://localhost:8788`
- 前端 Vite：`http://localhost:5173`

运行：

```powershell
npm run dev
```

开发时建议访问：

```text
http://localhost:5173/#/customer
http://localhost:5173/#/login
```

后台账号：

```text
appleadmin / apple123
```

开发模式适合改前端，因为页面会热更新。

### 3.3 演示 / 成品模式

演示模式先构建前端，再让 Express 同时提供页面和 API。

运行：

```powershell
npm run build -w web
cd .\server
$env:SERVE_WEB='1'
npm run start
```

访问：

```text
http://localhost:8788/#/customer
http://localhost:8788/#/login
```

演示录像建议用这个模式，因为项目只占用一个端口 `8788`。

### 3.4 使用 VS Code 任务

我已经添加了 `.vscode/tasks.json`，你可以在 VS Code 中这样运行：

1. 按 `Ctrl + Shift + P`。
2. 输入 `Tasks: Run Task`。
3. 选择下面任务之一：

| 任务 | 用途 |
| --- | --- |
| `npm: install` | 安装依赖 |
| `app: dev server + web` | 同时启动后端和 Vite 前端 |
| `web: build` | 构建前端 |
| `app: serve built app` | 启动构建后的成品模式 |
| `demo: start recording flow` | 从构建、启动、打开顾客页开始，适合录屏 |

### 3.5 使用 VS Code 调试后端

我已经添加了 `.vscode/launch.json`。

使用方式：

1. 打开左侧 `Run and Debug`。
2. 选择 `Debug API server`。
3. 点击绿色运行按钮。
4. 在 `server/src/index.js` 或 `server/src/llm.js` 打断点。

注意：这个调试配置只调试后端。前端调试建议直接用 Chrome DevTools。

## 4. Visual Studio 运行方式

Visual Studio 也能跑，但它不是这个项目的最佳 IDE，因为项目没有 `.sln`。

操作方式：

1. 打开 Visual Studio。
2. 选择 `File -> Open -> Folder...`。
3. 打开 `E:\boardgame-system`。
4. 打开内置终端：`View -> Terminal`。
5. 在终端运行和 VS Code 一样的命令。

开发模式：

```powershell
npm install
npm run dev
```

访问：

```text
http://localhost:5173/#/customer
```

演示模式：

```powershell
npm run build -w web
cd .\server
$env:SERVE_WEB='1'
npm run start
```

访问：

```text
http://localhost:8788/#/customer
```

如果 Visual Studio 安装了 Node.js 开发工作负载，也可以在 `package.json` 上看到 npm 脚本，但终端命令最稳定。

## 5. 演示录像运行方式

如果要从“项目运行开始”录制：

1. 先打开录屏软件。
2. 打开 PowerShell 或 VS Code 终端。
3. 运行：

```powershell
cd E:\boardgame-system
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1
```

如果端口 `8788` 已经被旧服务占用，重新启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -KillPortProcess
```

录制台本在：

```text
docs/demo/演示录像台本.md
```

功能说明文档在：

```text
docs/demo/功能说明文档.md
```

## 6. 常见问题

### 6.1 前端空白

先确认访问的是正确端口：

- 开发模式：`http://localhost:5173`
- 演示模式：`http://localhost:8788`

演示模式如果空白，重新构建：

```powershell
npm run build -w web
```

### 6.2 后端连接不上数据库

检查 MySQL 是否运行：

```powershell
Get-Service *mysql*
```

检查 `server/.env`：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=boardgame
DB_PASSWORD=boardgame
DB_NAME=boardgame
```

必要时重新初始化数据库：

```powershell
powershell -ExecutionPolicy Bypass -File .\db\setup-local.ps1 -AdminPassword "你的MySQL root密码"
```

### 6.3 8788 端口被占用

查看占用进程：

```powershell
Get-NetTCPConnection -LocalPort 8788 -State Listen
```

关闭占用进程：

```powershell
$p = Get-NetTCPConnection -LocalPort 8788 -State Listen | Select-Object -First 1
Stop-Process -Id $p.OwningProcess -Force
```

也可以用录制脚本自动处理：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -KillPortProcess
```

### 6.4 AI 不回答或返回演示内容

检查 `server/.env` 是否配置：

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=你的OpenAI兼容接口地址
OPENAI_MODEL=你的模型名
```

配置后重启后端。

### 6.5 PowerShell 不允许执行脚本

用下面写法临时放行当前命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1
```

## 7. 推荐日常流程

开发 UI 或功能：

```powershell
npm run dev
```

录制视频或给别人看：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -KillPortProcess
```

只启动后端调试：

```powershell
cd .\server
$env:SERVE_WEB='1'
npm run start
```

# 演示资料包

这个目录用于制作“从项目运行开始录制、边录制边讲解”的演示视频。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `功能说明文档.md` | 可直接交付给老师、客户或评审看的功能说明 |
| `演示录像台本.md` | 录屏时照着走的镜头顺序、操作步骤和旁白 |

## 推荐录制流程

1. 打开录屏软件。
2. 麦克风选择自己的讲话麦克风。
3. 录制区域选择整个屏幕或 Chrome + PowerShell。
4. 打开 PowerShell，进入项目根目录：

```powershell
cd E:\boardgame-system
```

5. 开始录制后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1
```

6. 按 `演示录像台本.md` 的顺序讲解。

## 可选参数

如果 8788 端口已有旧服务，想重新启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -KillPortProcess
```

如果已经构建过前端，想跳过构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -SkipBuild
```

如果只想启动服务，不自动打开浏览器：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-recording.ps1 -NoBrowser
```

## 录制时不要展示

- `server/.env` 的完整内容。
- 大模型 API Key。
- 个人浏览器隐私标签页。

## 建议视频结构

1. 项目启动。
2. 顾客预约页。
3. 后台登录。
4. 桌位运营。
5. 会员、优惠券、订单。
6. 桌游目录和 AI 文案。
7. 租借服务和战绩计分。
8. AI 经营助手。
9. 总结当前完成度和暂未接入的外部能力。

# 开发进度（2026-10-15 更新）

## 当前状态

后端、Web、移动端均已可编译并联调运行；`demo` profile 启动后有 10 个演示账号、请假与用章模板和示例申请。

| 检查 | 结果 |
|---|---|
| `backend`: `mvn test` | 43 个集成测试全部通过（真实 PostgreSQL，含 T01–T16，见 [测试报告](test_report.md)） |
| `frontend`: `npm run build` / `lint` / `test` | 通过（84 项金额测试） |
| `mobile`: `npm run typecheck` / `test` / `build:h5` / `build:mp-weixin` | 通过（20 项测试） |
| 联调 | 后端以 `eas_app` 低权限账号运行；Web 登录、工作台、通知 SSE、统计等接口已在浏览器中验证 |

## 已完成

- 后端：认证（JWT + 刷新令牌轮换）、权限与数据范围授权、流程引擎（条件节点、会签 / 或签、兜底审批人、并发控制、幂等）、四类申请（采购、差旅、报销、自定义表单）、附件（类型检测、PDF 主动内容检查）、通知（站内 + SSE + 邮件重试）、统计、管理端全部功能、定时任务（附件 / 幂等记录 / 软删草稿 / 刷新令牌清理，超时提醒）、演示数据。
- Web：全部页面（申请表单、列表、详情、待办 / 已办、统计、通知、管理端）。
- 移动端：16 个页面（工作台、四类申请、列表、详情、审批、通知、统计、我的）。

## 进行中 / 待办

1. 浏览器端到端走查 Web 与移动端各角色流程，修复发现的问题。
2. 后端第二轮跨模型代码审查（业务层）并按意见修改。
3. 文档：使用手册、总结、实验报告、演示视频说明、`git_log.txt` 导出。

## 本机运行（无 Docker 环境）

工具链和依赖服务见 `~/tools`：`source ~/tools/env.sh` 设置 JDK 17、Maven、PostgreSQL 16 客户端及数据库 / MinIO / SMTP 环境变量；`~/tools/start-services.sh` 启动 PostgreSQL、MinIO、Mailpit。

```bash
source ~/tools/env.sh
cd backend && mvn -B -q package -DskipTests
COOKIE_SECURE=false SPRING_PROFILES_ACTIVE=demo java -jar target/eas.jar   # http://localhost:8080/api
cd ../frontend && npx vite --port 5173                                    # Web
cd ../mobile && npm run dev:h5                                            # 移动端 H5：http://localhost:5174/m/
```

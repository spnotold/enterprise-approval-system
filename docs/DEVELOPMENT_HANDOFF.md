# 开发进度（2026-10-15 更新）

## 当前状态

后端、Web、移动端均已可编译并联调运行；`demo` profile 启动后有 10 个演示账号、请假与用章模板和示例申请，主功能和演示数据齐全。

| 检查 | 结果 |
|---|---|
| `backend`: `mvn test` | 真实 PostgreSQL 回归 54/54 通过，失败、错误、跳过均为 0；依据 `backend/target/surefire-reports/TEST*.xml`，含 T01–T16，见 [测试报告](test_report.md) |
| `frontend`: `npm run build` / `lint` / `test` | 全部通过（84 项测试） |
| `mobile`: `npm run typecheck` / `test` / `build:h5` / `build:mp-weixin` | 全部通过（20 项测试、同步 11 个文件） |
| Web 浏览器实录 | `rd_emp_wang` → `rd_head_li` → `fin_head_qian` → 王工，用章申请闭环通过；原始录像见 [demo/seal-approval-e2e.mp4](demo/seal-approval-e2e.mp4) |
| 移动端 H5 走查 | 实际登录、通知处理、同单详情、个人统计验证；canvas 正常绘制且无横向溢出 |

## 已完成

- 后端：认证（JWT + 刷新令牌轮换）、权限与数据范围授权、流程引擎（条件节点、会签 / 或签、兜底审批人、并发控制、幂等）、四类申请（采购、差旅、报销、自定义表单）、附件（类型检测、PDF 主动内容检查）、通知（站内 + SSE + 邮件重试）、统计、管理端全部功能、定时任务（附件 / 幂等记录 / 软删草稿 / 刷新令牌清理，超时提醒）、演示数据。
- Web：全部页面（申请表单、列表、详情、待办 / 已办、统计、通知、管理端）。
- 移动端：16 个页面（工作台、四类申请、列表、详情、审批、通知、统计、我的）。
- 文档、用户手册、总结、实验报告及演示录像说明已补齐；M3 实时刷新保留审批意见的问题已修复。

## 进行中 / 待办

1. Docker 部署验收。
2. 微信真机验收。
3. Claude 最终复审待返回；根据复审意见处理后完成复审。

## 本机运行（无 Docker 环境）

工具链和依赖服务见 `~/tools`：`source ~/tools/env.sh` 设置 JDK 17、Maven、PostgreSQL 16 客户端及数据库 / MinIO / SMTP 环境变量；`~/tools/start-services.sh` 启动 PostgreSQL、MinIO、Mailpit。

```bash
source ~/tools/env.sh
cd backend && mvn -B -q package -DskipTests
COOKIE_SECURE=false SPRING_PROFILES_ACTIVE=demo java -jar target/eas.jar   # http://localhost:8080/api
cd ../frontend && npx vite --port 5173                                    # Web
cd ../mobile && npm run dev:h5                                            # 移动端 H5：http://localhost:5174/m/
```

# 开发进度（2026-10-15 更新）

## 当前状态

后端、Web、移动端均已可编译并联调运行；`demo` profile 启动后有 10 个演示账号、请假与用章模板和示例申请，主功能和演示数据齐全。

| 检查 | 结果 |
|---|---|
| `backend`: `mvn test` | 真实 PostgreSQL 回归 62/62 通过，失败、错误、跳过均为 0；依据 12 份 `backend/target/surefire-reports/TEST*.xml`，含 T01–T16，见 [测试报告](test_report.md) |
| `frontend`: `npm run build` / `lint` / `test` | 再次全部通过（84 项测试） |
| `mobile`: `npm run typecheck` / `test` / `build:h5` / `build:mp-weixin` | 全部通过（20 项测试、同步 11 个文件） |
| Web 浏览器实录 | `rd_emp_wang` → `rd_head_li` → `fin_head_qian` → 王工，用章申请闭环通过；原始录像见 [demo/seal-approval-e2e.mp4](demo/seal-approval-e2e.mp4) |
| Docker 部署 | `docker compose up -d --build` 6 个服务全部健康；经 nginx 验证 Web / H5 页面、登录与 Cookie 续期、上传下载（MinIO）、SSE、Mailpit 收信；运行账号无建表和改日志权限，MinIO 专用 key 只能访问 `eas-files`；正式部署（profile 留空 + `EAS_ADMIN_PASSWORD`）只创建引导管理员，不加载演示账号；前置 HTTPS 代理场景同源请求正常、跨域仍拒绝 |
| 移动端 H5 走查 | 实际登录、通知处理、同单详情、个人统计验证；canvas 正常绘制且无横向溢出 |

## 已完成

- 后端：认证（JWT + 刷新令牌轮换）、权限与数据范围授权、流程引擎（条件节点、会签 / 或签、兜底审批人、并发控制、幂等）、四类申请（采购、差旅、报销、自定义表单）、附件（类型检测、PDF 主动内容检查）、通知（站内 + SSE + 邮件重试）、统计、管理端全部功能、定时任务（附件 / 幂等记录 / 软删草稿 / 刷新令牌清理，超时提醒）、演示数据。
- Web：全部页面（申请表单、列表、详情、待办 / 已办、统计、通知、管理端）。
- 移动端：16 个页面（工作台、四类申请、列表、详情、审批、通知、统计、我的）。
- 文档、用户手册、总结、实验报告及演示录像说明已补齐；M3 实时刷新保留审批意见的问题已修复。
- Web 复审反馈的刷新失败恢复路径已补齐：审批弹窗内可查看错误并重新加载，实际浏览器验证意见保留且恢复后可继续操作；最终复审反馈已处理并完成针对性回归。
- 两轮 Claude 最终复审确认 H1 复制校验、H2 附件隐私、原 M1 长跨度、M2 默认文字上限、L1 关联信息和 L4 催办问题均已关闭，无新增中高缺陷。剩余 Low 极端年份问题已补充 0001–9999 校验，并完成完整 55 项真实 PostgreSQL 回归。
- 第二轮 gpt-6.1-sol 后端审查的 6 项必修问题（管理员审批隔离、会签转办重复投票、重复票据信息披露、管理员读取审计、小数金额截断、自定义字段默认限制）已修复，新增 5 项回归，后端共 60 项通过。

## 进行中 / 待办

1. 微信真机验收。

## 本机运行（无 Docker 环境）

工具链和依赖服务见 `~/tools`：`source ~/tools/env.sh` 设置 JDK 17、Maven、PostgreSQL 16 客户端及数据库 / MinIO / SMTP 环境变量；`~/tools/start-services.sh` 启动 PostgreSQL、MinIO、Mailpit。

```bash
source ~/tools/env.sh
cd backend && mvn -B -q package -DskipTests
COOKIE_SECURE=false SPRING_PROFILES_ACTIVE=demo java -jar target/eas.jar   # http://localhost:8080/api
cd ../frontend && npx vite --port 5173                                    # Web
cd ../mobile && npm run dev:h5                                            # 移动端 H5：http://localhost:5174/m/
```

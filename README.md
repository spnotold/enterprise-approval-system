# 企业审批系统

浙江大学《BS 体系软件设计》课程大程。系统内置采购、差旅、报销三类业务审批，并支持管理员配置自定义流程（初始化数据中带请假、用章两个种子模板），提供站内通知、统计报表，以及 Web 端和移动端（H5 / 微信小程序）。

作者：李宇航

使用说明见[使用手册](docs/user_guide.md)，测试结果见[测试报告](docs/test_report.md)。

## 技术栈

| 模块 | 技术 |
|---|---|
| 后端 | Java 17、Spring Boot 3.3、Spring Security 6 + JWT、MyBatis-Plus 3.5、Flyway 10 |
| 数据库 | PostgreSQL 16 |
| 文件存储 | MinIO（私有桶，后端鉴权后转发） |
| Web 前端 | Vue 3.4、TypeScript 5、Vite 5、Element Plus 2、Pinia 2、Vue Router 4、ECharts 5、axios |
| 移动端 | uni-app（Vue 3 + TypeScript）、uni-ui、uCharts |
| 部署 | Docker Compose、Nginx |

## 目录结构

```text
enterprise-approval-system
├── .gitignore
├── docker-compose.yml      # 容器编排
├── README.md
├── template.env            # .env 模板
├── backend                 # 后端（Spring Boot）
├── frontend                # Web 前端（Vue 3）
├── mobile                  # 移动端（uni-app）
├── nginx                   # Nginx 配置与镜像构建
├── db
│   └── init
│       └── 01_create_app_user.sh   # 创建运行账号 eas_app，设置默认权限
└── docs
    ├── design_document.md  # 设计文档
    ├── design_document.docx # 设计文档 Word 版
    ├── user_guide.md       # 使用手册
    ├── test_report.md      # 测试报告
    ├── summary.md          # 总结
    ├── git_log.txt         # git log 导出
    ├── demo_video.md       # 演示视频说明（录像在 demo/）
    ├── experiment_report   # 实验报告（含封面；Word、PDF 与 Markdown 版）
    └── archive             # 归档：开发过程交接记录
```

后端包结构位于 `backend/src/main/java/edu/zju/eas`：`config`、`controller`、`dto`、`model`、`repository`、`response`、`service`（含 `flow` 流程引擎、`notify` 通知、`job` 定时任务）。数据库脚本位于 `backend/src/main/resources/db`。

## 本地开发

环境要求：JDK 17、Maven 3.9、Node.js 20、Docker。

1. 启动依赖服务（数据库、MinIO、Mailpit）：

   ```bash
   cp template.env .env
   docker compose up -d postgres minio minio-init mailpit
   ```

2. 启动后端：

   ```bash
   cd backend
   mvn spring-boot:run
   ```

3. 启动 Web 前端（开发服务器将 `/api` 代理到 `localhost:8080`）：

   ```bash
   cd frontend
   cp template.env.local .env.local
   npm install
   npm run dev
   ```

4. 移动端：

   ```bash
   cd mobile
   npm install
   npm run dev:h5        # H5
   npm run dev:mp-weixin # 微信小程序，用微信开发者工具打开 dist/dev/mp-weixin
   ```

## 部署

```bash
cp template.env .env    # 填写数据库、MinIO 密码与 JWT_SECRET
docker compose up -d --build
```

- 启动后访问 `http://localhost`（移动端 H5 为 `http://localhost/m/`），演示邮件收件箱为 `http://localhost:8025`。端口被占用时在 `.env` 中修改 `HTTP_PORT`、`MAILPIT_PORT`，并相应修改 `APP_BASE_URL`（邮件中的链接前缀）。
- `SPRING_PROFILES_ACTIVE=demo`（`template.env` 默认开启）会加载演示账号（密码 `Demo@2026`）和示例申请；正式部署把它留空，并设置 `EAS_ADMIN_PASSWORD`，首次启动时创建系统管理员 `admin`。
- 通过 http 访问（如局域网 IP）时保持 `COOKIE_SECURE=false`，否则浏览器不保存刷新令牌 Cookie；部署在 https 后改为 `true`。在 nginx 前面再加一层终止 TLS 的反向代理时，该代理需设置 `X-Forwarded-Proto: https` 并保留原始 `Host`。
- 数据库与 MinIO 仅在 compose 内部网络可见。数据卷首次初始化时 `db/init` 脚本创建运行账号 `eas_app`；后端启动时用 `eas_owner` 执行 Flyway 迁移，运行时用 `eas_app` 连接（只有增删改查，日志表只能追加），MinIO 使用只能读写 `eas-files` 桶的专用 key。接口统一以 `/api` 为前缀。
- MinIO 官方已不再发布二进制和镜像，`minio/Dockerfile` 从固定提交的源码编译 `minio` 与 `mc`，首次构建需要几分钟并能访问 Go 模块代理。

## 分支约定

- `main`：可演示版本
- `dev`：集成分支
- `feature/<模块>`：功能开发

提交信息格式：`feat(flow): ...`、`fix(expense): ...`。

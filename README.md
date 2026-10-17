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
├── docker-compose.dev.yml  # 本地开发：发布依赖服务端口
├── README.md
├── template.env            # .env 模板
├── backend                 # 后端（Spring Boot）
├── frontend                # Web 前端（Vue 3）
├── mobile                  # 移动端（uni-app）
├── minio                   # MinIO 镜像构建（minio 与 mc）
├── nginx                   # Nginx 配置与镜像构建
├── db
│   └── init
│       └── 01_create_app_user.sh   # 创建运行账号 eas_app，设置默认权限
└── docs
    ├── design_document.md  # 设计文档
    ├── design_document.docx # 设计文档 Word 版
    ├── user_guide.md       # 使用手册
    ├── ui_design.md        # 界面设计规范（Web 与移动端）
    ├── test_report.md      # 测试报告
    ├── summary.md          # 总结
    ├── git_log.txt         # git log 导出
    ├── demo_video.md       # 演示视频说明（录像在 demo/）
    ├── demo                # 演示录像（seal-approval-e2e.mp4）
    ├── experiment_report   # 实验报告（含封面；Word、PDF 与 Markdown 版）
    └── archive             # 归档：开发过程交接记录
```

后端包结构位于 `backend/src/main/java/edu/zju/eas`：`config`、`controller`、`dto`、`model`、`repository`、`response`、`service`（含 `flow` 流程引擎、`notify` 通知、`job` 定时任务）。数据库脚本位于 `backend/src/main/resources/db`。

## 本地开发

环境要求：JDK 17、Maven 3.9、Node.js 20、Docker。

1. 启动依赖服务（数据库、MinIO、Mailpit）。`docker-compose.dev.yml` 把它们的端口发布到本机 `127.0.0.1`（PostgreSQL 5432、MinIO 9000、SMTP 1025，被占用时在 `.env` 中设置 `DEV_PG_PORT`、`DEV_MINIO_PORT`、`DEV_SMTP_PORT`）：

   ```bash
   cp template.env .env    # 把 JWT_SECRET 换成 `openssl rand -base64 48` 的输出，保留模板占位值后端拒绝启动
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio minio-init mailpit
   ```

   开发用的依赖服务和部署共用 Compose 项目名与数据卷。如果同一目录下已经在运行完整部署，上面的命令会给这些容器加上端口映射后重建。想和部署同时运行时，复制一份 `.env.dev`，在其中把 `MAILPIT_PORT` 和三个 `DEV_*_PORT` 改成未占用的端口，命令加上 `-p eas-dev --env-file .env.dev`，第 2 步改为读入 `../.env.dev`。

2. 启动后端。先读入 `.env`，再把其中的变量对应到后端读取的名字（运行账号 `eas_app` 的密码 `DB_PASSWORD` 同名，不用改）：

   ```bash
   cd backend
   set -a; . ../.env; set +a
   DB_URL=jdbc:postgresql://localhost:${DEV_PG_PORT:-5432}/eas \
   FLYWAY_PASSWORD=$DB_OWNER_PASSWORD \
   MINIO_ENDPOINT=http://localhost:${DEV_MINIO_PORT:-9000} \
   MINIO_ACCESS_KEY=$MINIO_APP_ACCESS_KEY MINIO_SECRET_KEY=$MINIO_APP_SECRET_KEY \
   SMTP_HOST=localhost SMTP_PORT=${DEV_SMTP_PORT:-1025} \
   mvn spring-boot:run
   ```

   后端监听 `http://localhost:8080/api`；`.env` 中的 `SPRING_PROFILES_ACTIVE=demo` 会加载演示账号（密码 `Demo@2026`）。

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
   npm run dev:h5        # H5，访问 http://localhost:5174/m/（与上面 Web 开发服务器同开时；单独运行是 http://localhost:5173/m/）
   npm run dev:mp-weixin # 微信小程序，用微信开发者工具打开 dist/dev/mp-weixin
   ```

   微信开发者工具导入 `dist/dev/mp-weixin` 时可选择「测试号/游客模式」，正式使用需在 `manifest.json` 填自己的 appid。

## 部署

```bash
cp template.env .env    # 填写数据库、MinIO 密码与 JWT_SECRET（用 `openssl rand -base64 48` 生成；保留模板占位值将无法启动）
docker compose up -d --build
```

- 启动后访问 `http://localhost`（移动端 H5 为 `http://localhost/m/`），演示邮件收件箱为 `http://localhost:8025`（只绑定本机 `127.0.0.1`，远程访问可用 `ssh -L 8025:127.0.0.1:8025 <服务器>` 转发）。端口被占用时在 `.env` 中修改 `HTTP_PORT`、`MAILPIT_PORT`，并相应修改 `APP_BASE_URL`（邮件中的链接前缀）。
- 默认 SMTP 走容器内的 Mailpit（无认证、无加密）；接入真实 SMTP 时在 `.env` 中填写 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`，设 `SMTP_AUTH=true`，并按端口开启加密：465 设 `SMTP_SSL=true`，587/25 设 `SMTP_STARTTLS=true`。
- `SPRING_PROFILES_ACTIVE=demo`（`template.env` 默认开启）会加载演示账号（密码 `Demo@2026`）和示例申请，登录页的“演示账号”区块也只在该模式下显示；正式部署把它留空，并设置 `EAS_ADMIN_PASSWORD`，首次启动时创建系统管理员 `admin`。
- 通过 http 访问（如局域网 IP）时保持 `COOKIE_SECURE=false`，否则浏览器不保存刷新令牌 Cookie；部署在 https 后改为 `true`。在 nginx 前面再加一层终止 TLS 的反向代理时，该代理需设置 `X-Forwarded-Proto: https` 并保留原始 `Host`。
- 前置代理还需把真实客户端 IP 追加到 `X-Forwarded-For`（nginx 用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`），并在 `.env` 中设置 `TRUSTED_PROXY_CIDR=<该代理的地址或网段，多个用逗号分隔>`（如 `172.16.0.0/12`）。否则 nginx 看到的来源地址都是该代理，登录、注册的 IP 限流会变成全站共用，审计日志里的 IP 也都是代理地址。设置后 nginx 只在请求来自这些地址时才采信 `X-Forwarded-For`，并以其中最右侧的非可信地址作为客户端 IP；留空（默认）表示直连，不信任任何 `X-Forwarded-For`，客户端伪造的该头不起作用。不要设为 `0.0.0.0/0`，否则客户端可以伪造 IP。
- 数据库与 MinIO 仅在 compose 内部网络可见。数据卷首次初始化时 `db/init` 脚本创建运行账号 `eas_app`；后端启动时用 `eas_owner` 执行 Flyway 迁移，运行时用 `eas_app` 连接（只有增删改查，日志表只能追加），MinIO 使用只能读写 `eas-files` 桶的专用 key。接口统一以 `/api` 为前缀。
- MinIO 官方已不再发布二进制和镜像，`minio/Dockerfile` 从固定提交的源码编译 `minio` 与 `mc`，首次构建需要几分钟并能访问 Go 模块代理。

## 分支约定

- `main`：可演示版本
- `dev`：集成分支
- `feature/<模块>`：功能开发

提交信息格式：`feat(flow): ...`、`fix(expense): ...`。

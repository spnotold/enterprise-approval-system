# 企业审批系统

浙江大学《BS 体系软件设计》课程大程。系统内置采购、差旅、报销三类业务审批，并支持管理员配置自定义流程（初始化数据中带请假、用章两个种子模板），提供站内通知、统计报表，以及 Web 端和移动端（H5 / 微信小程序）。

作者：李宇航

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
    ├── design_document.docx
    ├── user_guide.md       # 使用手册
    ├── test_report.md      # 测试报告
    ├── summary.md          # 总结
    ├── git_log.txt         # git log 导出
    ├── demo_video.md       # 演示视频链接与说明
    └── experiment_report   # 实验报告（含封面）
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

启动后访问 `http://localhost`，演示邮件收件箱为 `http://localhost:8025`。数据库与 MinIO 仅在 compose 内部网络可见。数据卷首次初始化时 `db/init` 脚本创建运行账号 `eas_app`；后端启动时用 `eas_owner` 执行 Flyway 迁移，运行时用 `eas_app` 连接，MinIO 使用只能读写 `eas-files` 桶的专用 key。接口统一以 `/api` 为前缀。

## 分支约定

- `main`：可演示版本
- `dev`：集成分支
- `feature/<模块>`：功能开发

提交信息格式：`feat(flow): ...`、`fix(expense): ...`。

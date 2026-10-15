# 测试报告

## 1. 测试环境与运行方式

| 项目 | 说明 |
|---|---|
| 后端 | JDK 17、Spring Boot 3.3、JUnit 5、Spring Boot Test（MockMvc 走完整安全过滤链） |
| 数据库 | 真实 PostgreSQL 16，Flyway 迁移与演示数据和部署环境一致；不用 H2，因为条件更新、部分唯一索引、触发器只有在真实 PostgreSQL 上才测得准 |
| 隔离 | 每次运行新建带随机后缀的临时库，结束后删除；每个用例开始前清空业务数据并重放种子脚本（`IntegrationTestBase`） |
| 文件存储 | 测试中 `StorageService` 由 Mock 替代；Tika 魔数检测、附件绑定与权限检查走真实代码，对象读写及写入时的哈希计算不由该套集成测试验证 |
| Web 前端 | Vitest：金额转换（元 ↔ 分）边界输入 |
| 移动端 | Node test runner：表单校验、金额、自定义表单渲染工具函数 |

后端测试需要一个可建库的 PostgreSQL 账号，通过环境变量提供：

```bash
export EAS_TEST_PG_URL=jdbc:postgresql://localhost:5432/postgres
export EAS_TEST_PG_USER=eas_test EAS_TEST_PG_PASSWORD=...
# CoreWorkflowIntegrationTest 另用一个已存在的测试库
export EAS_TEST_DB_URL=jdbc:postgresql://localhost:5432/eas_it EAS_TEST_DB_USER=eas_test EAS_TEST_DB_PASSWORD=...
cd backend && mvn test
```

没有设置上述变量时，`AdminTemplateStatsTest` 会改用 Testcontainers 启动 `postgres:16-alpine`（需要 Docker），其余集成测试自动跳过。

## 2. 结果汇总

| 模块 | 用例数 | 通过 | 失败 |
|---|---:|---:|---:|
| 后端 `CoreWorkflowIntegrationTest` | 13 | 13 | 0 |
| 后端 `BusinessRulesTest` | 4 | 4 | 0 |
| 后端 `ReviewRegressionTest` | 6 | 6 | 0 |
| 后端 `FlowRulesTest` | 6 | 6 | 0 |
| 后端 `AdminTemplateStatsTest` | 12 | 12 | 0 |
| 后端 `AccessControlTest` | 5 | 5 | 0 |
| 后端 `TemplateVersionTest` | 1 | 1 | 0 |
| 后端 `NotificationTest` | 1 | 1 | 0 |
| 后端 `DemoDataTest` | 3 | 3 | 0 |
| 后端 `MaintenanceJobsTest` | 3 | 3 | 0 |
| 后端合计 | **54** | **54** | **0** |
| Web `npm run test` | 84 | 84 | 0 |
| 移动端 `npm run test` | 20 | 20 | 0 |

后端结果依据 `backend/target/surefire-reports/TEST*.xml`：真实 PostgreSQL 回归共 54 项，失败 0、错误 0、跳过 0。Web `npm run lint`、`npm run build` 均通过；移动端 `npm run typecheck` 通过，同步 11 个文件，`npm run build:h5` 与 `npm run build:mp-weixin` 均通过。

## 3. 关键场景（设计文档 Q17，T01–T16）

演示账号密码均为 `Demo@2026`。

| 编号 | 场景 | 测试方法 | 结果 |
|---|---|---|---|
| T01 | `rd_emp_chen` 打开 `rd_emp_wang` 的申请详情、日志；`scope=mine` 列表 | `security.AccessControlTest#t01_colleagueCannotSeeOthersApplication` | 通过：详情、日志 404，列表不含王工的单 |
| T02 | `mkt_head_sun` 查本部门申请、打开研发部申请 | `AccessControlTest#t02_deptHeadOnlySeesOwnDepartment` | 通过：列表只有市场部，研发部单 404 |
| T03 | `fin_auditor_wu` 批准仍在部门负责人节点的单 | `AccessControlTest#t03_onlyCurrentApproverCanAct` | 通过：403 / `40302`，状态不变 |
| T04 | `admin` 调用批准接口、访问待办 | `AccessControlTest#t04_adminCannotApprove` | 通过：403 / `40301`；待办 403；业务详情 404 |
| T05 | `rd_head_li` 提交报销 | `flow.FlowRulesTest#t05_deptHeadOwnApplicationGoesToFallback` | 通过：第 1 节点替代为 `ceo_zhao`，节点记录替代说明；李研待办为空 |
| T06 | 保存与提交时请求体带 `applicantId`、`totalAmountCents`、`status` | `biz.BusinessRulesTest#t06_clientCannotOverrideApplicantOrTotals` | 通过：申请人仍为王工，金额按明细重算 |
| T07 | 两条明细 0.10 元、0.20 元 | `BusinessRulesTest#t07_totalIsRecomputedInCents` | 通过：合计 30 分 |
| T08 | 两条明细挂同一个票据文件 | `BusinessRulesTest#t08_sameInvoiceFileTwiceInOneReport` | 通过：422，`EXP_DUP_INVOICE_IN_APP` |
| T09 | `.exe` 改名为 `.png` 上传 | `BusinessRulesTest#t09_renamedExecutableIsRejected` | 通过：415 / `41501` |
| T10 | 撤回与批准同时发出（`CountDownLatch` 对齐，连续 20 轮） | `FlowRulesTest#t10_withdrawAndApproveRace` | 通过：每轮恰好一个 200、一个 409；只有一条有效日志；无残留待办 |
| T11 | 同一待办用两个幂等键并发批准 | `FlowRulesTest#t11_concurrentApproveSameTask` | 通过：一个成功，另一个 409；下一节点只有一个待办 |
| T12 | 同一 `Idempotency-Key` 提交两次；同键换请求体 | `FlowRulesTest#t12_sameIdempotencyKeyReplays` | 通过：响应相同，第二次带 `Idempotent-Replayed: true`，只有一个流程实例；换请求体 `40904` |
| T13 | 重复提交后李研的通知；`rd_emp_chen` 标记李研的通知 | `notify.NotificationTest#t13_singleTaskAssignedAndNoCrossUserAccess` | 通过：只有一条 `TASK_ASSIGNED`；陈工 404 且通知仍未读 |
| T14 | 提交报销后管理员把企业负责人阈值改为 5000 元并发布 | `template.TemplateVersionTest#t14_publishedVersionDoesNotRewriteSubmittedApplications` | 通过：旧单仍绑定旧版本、节点不变；新单按新阈值经过企业负责人；发布写入审计 |
| T15 | `pending_he` 登录；错误密码 | `AccessControlTest#t15_pendingRegistrationCannotLogIn` | 通过：403 / `40104`；错误密码 `40103` |
| T16 | 已通过的单再次批准、撤回 | `FlowRulesTest#t16_finishedApplicationIsImmutable` | 通过：409 |

## 4. 集成测试覆盖

**`CoreWorkflowIntegrationTest`（13 个）**：草稿版本冲突（`40905`）与不完整草稿提交 422；提交幂等重放与权限；审批与撤回并发；差旅高预算触发第二节点且部门在提交时冻结；驳回后复制为新草稿并保留历史；采购合计与多级审批；关联摘要（LINKED）不泄露原单附件和审批意见；分页只统计有权限的行；会签需全部同意且重放不重复计数；或签取消其余待办且只前进一次；自定义表单 Schema 与发布版本校验；部门负责人能看正文但不能读附件；并发绑定附件只有一个归属；待办数量接口、ISO 日期查询参数。

**`BusinessRulesTest`（4 个）**：客户端不能覆盖申请人和总额；金额按分重算；同一报销单重复挂载票据会被拒绝；仅改扩展名的可执行文件会被拒绝。

**`ReviewRegressionTest`（6 个）**：复制申请时按当前 Schema 清空不再符合规则的日期、选项、正则及附件规则字段，且源单不变；停用的同行人不复制；采购、差旅、报销、自定义四类业务在无附件权限时对附件元数据、ID、票据及 custom 值脱敏；超过 90 天的差旅草稿返回 400 而非 500；TEXT 200 字符和 TEXTAREA 2000 字符上限正确计入空白及 emoji；重复催办返回 `false`，详情冷却状态与通知记录一致，不重复发通知。

**`FlowRulesTest`（6 个）**：部门负责人自审时走兜底审批人；撤回与批准并发、同一待办并发批准均只产生一个有效结果；幂等键重放不会重复创建流程；已结束申请不可再次审批或撤回；节点流转按配置推进。

**`admin.AdminTemplateStatsTest`（12 个）**：模板发布保留旧版本与适用部门；校验汇总字段、节点、审批人错误且不改变已发布版本；内置模板表单不可改、草稿创建串行化；审计写入失败时整个发布回滚；并发停用不能同时停掉两个管理员；最后一个管理员保护、部门负责人角色同步与注册审核；授权、主办人、重置密码、系统配置均写审计并校验（临时密码不进审计日志）；管理端查询只返回元数据、不含业务正文；部门统计按提交时间与提交时部门、通过率分母只算终态；财务与企业统计校验有效期内的授权且不按票据数重复累计金额；模板路由返回契约并拒绝无权访问。

**`security.AccessControlTest`（5 个）**：跨用户、跨部门、非当前审批人、管理员业务访问及待审核账号登录权限隔离（对应 T01–T04、T15）。

**`template.TemplateVersionTest`（1 个）**：模板发布不改写已提交申请所绑定的版本与流程。

**`notify.NotificationTest`（1 个）**：通知只分配给目标用户，其他用户无法读取或标记。

**`demo.DemoDataTest`（3 个）**：`demo` profile 在全新数据库上启动；演示账号可登录、待审核账号 `40104`、管理员没有 `TASK_HANDLE`；请假、用章模板通过发布校验；示例申请经真实流程生成（王工的已通过差旅、停在吴审处的采购、已驳回报销，周敏 5 天请假经过企业负责人节点），重复启动不重复生成。

**`job.MaintenanceJobsTest`（3 个）**：TEMP 附件解绑后保留 24 小时；超时任务每日只提醒一次；扫描后已完成审批不会误发提醒。第三项先锁定申请再复核，测试确实观察到扫描受阻于锁，覆盖并发时序。

## 5. 测试中发现并修复的缺陷

| 缺陷 | 发现方式 | 修复 |
|---|---|---|
| 登录接口 500：写刷新令牌时 MyBatis 没有 `UUID` 类型处理器 | `DemoDataTest` 首次走真实登录接口 | 全局注册 `UuidTypeHandler` |
| 自定义表单数字字段按字符串比较，请假 10 天被判为不超过 3 天 | 编写演示请假数据时核对条件求值 | 条件变量按字段类型转换为 `BigDecimal` / `Long` / `LocalDate` |
| 部门统计按月汇总 SQL 语法错误（`month` 是关键字，别名需 `AS`） | `AdminTemplateStatsTest` | 补 `AS` |
| 前端调用 `GET /tasks/pending-count` 无对应接口 | 接口地址交叉核对 | 新增接口 |
| 幂等重放未返回 `Idempotent-Replayed` 头 | T12 | 重放时写响应头 |
| 列表日期参数按本地化格式解析，`YYYY-MM-DD` 可能 400 | 接口核对 | `spring.mvc.format.date: iso` |
| 审批操作实时刷新可能丢失已填写意见（M3） | 代码审查与回归 | 刷新后保留审批意见；Claude 最终复审仍在进行 |

## 6. 浏览器实录与移动端走查

- Web 浏览器实际走通用章审批闭环：`rd_emp_wang` 发起，`rd_head_li` 和 `fin_head_qian` 审批，王工查看完成结果。原始录像：[docs/demo/seal-approval-e2e.mp4](demo/seal-approval-e2e.mp4)，说明：[docs/demo_video.md](demo_video.md)。
- 移动端实际通过 H5 登录、通知处理、同一申请详情和个人统计页面检查；统计 canvas 有 92,136 个非透明像素，页面无横向溢出。
- Docker 部署和微信真机尚未验收；移动端双端构建通过不代表微信真机验收完成。

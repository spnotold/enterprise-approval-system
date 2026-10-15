# 开发交接（2026-10-15）

本次按要求保存前一位开发者的进度，只做小范围收尾，剩余开发留给原开发者继续。当前不是可完整演示的版本。

## 已保存的进度

- 分支：`main`；原有改动已通过 `81dbf5f` 提交并推送到 `origin/main`。
- 后端已有认证、权限、通知、文件服务、数据库 V1–V4 迁移和流程引擎代码；这些代码尚未完成整体编译与业务验收。
- Web 已有申请表单、列表、管理界面和共享组件；申请详情、待办列表仍是占位页。
- 移动端已有认证、工作台、通知、差旅申请及部分详情和审批界面；仍有缺失页面和类型问题。

## 本次收尾

- 为 Web 申请列表的表格槽位行补上局部类型断言，恢复 Web 构建。
- 合并移动端附件选择器的重复变量声明，保留 H5“选择文件”、其他平台“聊天文件”的文案。
- 执行 `mobile` 的 `npm run sync-lib`，同步共享认证接口、类型及金额函数，消除已过期的生成文件。

## 验证结果

以下均在本次收尾后的工作区执行；通过构建不代表业务已经完成。

| 检查 | 结果 |
|---|---|
| `frontend`: `npm run build` | 通过；有产物体积警告 |
| `frontend`: `npm run test` | 通过，84 项金额测试 |
| `frontend`: `npm run lint` | 通过 |
| `mobile`: `npm run sync-lib -- --check` | 通过，11 个共享文件与 Web 一致 |
| `backend`: `mvn -B test`（JDK 17） | 编译失败，尚未运行测试；缺少 `dto.app.ApplicationSummary`、`dto.app.ListQuery` |
| `mobile`: `npm run typecheck` | 失败；剩余 uni-app 事件类型与上传任务类型错误 |
| `mobile`: `npm run build:h5` | 失败，缺少下述四个页面 |
| `mobile`: `npm run build:mp-weixin` | 命令退出码为 0，但同样提示四个页面不存在，不能视为可用构建 |

本机 JDK/Maven 不在默认 PATH，后端实际使用以下命令：

```bash
cd backend
JAVA_HOME=/home/liyuhang/tools/jdk17 /home/liyuhang/tools/maven/bin/mvn -B test
```

## 建议接续位置

1. 先处理后端当前编译断点：`ApplicationMapper.java` 引用的两个申请 DTO 尚不存在；列表方法注释提到的 `ApplicationMapper.xml` 也尚未加入。补齐后重新编译，继续处理后续报错。
2. 从 `service/flow/FlowEngine.java` 和 `BizHandler.java` 接回原开发工作：目前没有 `BizHandler` 实现类，申请与待办控制器也尚未加入。文件服务已有实现，但上传、下载控制器仍待接入。继续按照 `docs/design_document.md` 实现与验证。
3. Web 的 `src/views/applications/ApplicationDetail.vue`、`src/views/tasks/TaskList.vue` 仍显示“待实现”。
4. 移动端 `pages.json` 注册了以下尚不存在的页面，需要补齐实际页面：
   - `pages/apply/purchase.vue`
   - `pages/apply/expense.vue`
   - `pages/apply/custom.vue`
   - `pages/stats/index.vue`
5. 移动端剩余类型问题主要位于 `ApproveSheet.vue`、`AttachmentPicker.vue`、`CustomFormRenderer.vue`、`MoneyInput.vue` 和多个页面的 `e.detail.value` 事件处理，以及 `lib/files.ts` 的 `uni.uploadFile` 返回值。不要通过关闭严格检查来掩盖问题。
6. 后续还需完成接口联调、数据库迁移验证、流程并发及权限测试、完整业务验收和报告。本次没有执行运行中服务的业务验收。

跨模型审查已尝试调用 Claude Opus 5.5（xhigh，关闭 fast），但因 API 限流未能执行；本次有限改动已由 GPT-6.1-Sol Max 标准模式独立复核，未发现本轮新增问题或阻塞项。

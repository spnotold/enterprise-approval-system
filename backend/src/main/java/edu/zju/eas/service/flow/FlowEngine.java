package edu.zju.eas.service.flow;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import edu.zju.eas.common.AuditTrail;
import edu.zju.eas.common.Audited;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.common.RequestInfo;
import edu.zju.eas.dto.common.UserBrief;
import edu.zju.eas.dto.flow.ActionResult;
import edu.zju.eas.dto.flow.ApproveRequest;
import edu.zju.eas.dto.flow.PathPreview;
import edu.zju.eas.dto.flow.RejectRequest;
import edu.zju.eas.dto.flow.TransferRequest;
import edu.zju.eas.model.app.Application;
import edu.zju.eas.model.app.CustomFormData;
import edu.zju.eas.model.flow.ApprovalLog;
import edu.zju.eas.model.flow.ApprovalTask;
import edu.zju.eas.model.flow.AssigneeHistory;
import edu.zju.eas.model.flow.FlowInstance;
import edu.zju.eas.model.flow.FlowNodeInstance;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.model.template.NodeDef;
import edu.zju.eas.model.template.ProcessTemplate;
import edu.zju.eas.model.template.ProcessTemplateVersion;
import edu.zju.eas.repository.ApplicationMapper;
import edu.zju.eas.repository.ApprovalLogMapper;
import edu.zju.eas.repository.ApprovalTaskMapper;
import edu.zju.eas.repository.AssigneeHistoryMapper;
import edu.zju.eas.repository.CustomFormDataMapper;
import edu.zju.eas.repository.FlowInstanceMapper;
import edu.zju.eas.repository.FlowNodeInstanceMapper;
import edu.zju.eas.repository.FlowQueryMapper;
import edu.zju.eas.repository.ProcessTemplateDeptMapper;
import edu.zju.eas.repository.ProcessTemplateMapper;
import edu.zju.eas.repository.ProcessTemplateVersionMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.repository.UrgeRecordMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.notify.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 流程引擎：提交、批准、驳回、撤回、转办、催办。每个操作在一个事务里完成：
 * 先以条件更新锁住并推进 application 行，再完成 / 取消 approval_task，最后写节点、日志与通知。
 */
@Service
@RequiredArgsConstructor
public class FlowEngine {
    private static final long URGE_BUCKET_SECONDS = 4 * 3600L;

    private final ApplicationMapper appMapper;
    private final ApprovalTaskMapper taskMapper;
    private final FlowNodeInstanceMapper nodeMapper;
    private final FlowInstanceMapper instanceMapper;
    private final ApprovalLogMapper logMapper;
    private final AssigneeHistoryMapper historyMapper;
    private final UrgeRecordMapper urgeMapper;
    private final ProcessTemplateMapper templateMapper;
    private final ProcessTemplateVersionMapper versionMapper;
    private final ProcessTemplateDeptMapper templateDeptMapper;
    private final CustomFormDataMapper customMapper;
    private final SysUserMapper userMapper;
    private final FlowQueryMapper flowQueryMapper;
    private final ApproverResolver resolver;
    private final ConditionEvaluator evaluator;
    private final List<BizHandler> handlers;
    private final NotificationService notifyService;
    private final UserDirectory users;
    private final Clock clock;

    // =====================================================================
    // 提交
    // =====================================================================

    /** 一个节点的规划结果：条件是否成立、解析出的审批人 */
    record PlannedNode(int seq, NodeDef def, Boolean conditionResult, boolean effective, String conditionText,
                       ApproverResolver.Resolution resolution, String error) {
    }

    @Transactional
    public ActionResult submit(Long appId, int appVersion, CurrentUser u) {
        Application app = appMapper.selectById(appId);
        if (app == null || app.getDeletedAt() != null || !app.getApplicantId().equals(u.id())) {
            throw BizException.notFound();
        }
        if (!"DRAFT".equals(app.getStatus())) {
            throw BizException.stateChanged();
        }
        if (app.getVersion() != appVersion) {
            throw new BizException(ErrorCode.DRAFT_MODIFIED);
        }
        SysUser applicant = userMapper.selectById(u.id());
        Long deptId = applicant.getDeptId();   // 提交时固化为申请人主属部门
        ProcessTemplate tpl = requireUsableTemplate(app.getTemplateId(), deptId);
        ProcessTemplateVersion ver = versionMapper.selectById(tpl.getCurrentVersionId());
        if ("CUSTOM".equals(app.getType())) {
            CustomFormData data = customMapper.selectById(appId);
            if (data == null || !ver.getId().equals(data.getTemplateVersionId())) {
                throw new BizException(ErrorCode.TEMPLATE_UPDATED);   // 草稿按旧版本填写
            }
        }

        BizHandler.SubmitData data = handler(app.getType()).prepareSubmit(app, u);
        List<PlannedNode> plan = plan(ver, data, u.id(), deptId, false);
        PlannedNode first = plan.stream().filter(PlannedNode::effective).findFirst()
                .orElseThrow(() -> BizException.rule(null, "FLOW_NO_NODE", "没有需要审批的节点，请联系管理员检查模板"));

        // ① 先锁并推进申请行
        if (appMapper.submit(appId, u.id(), appVersion, deptId, ver.getId(), data.amountCents(), first.seq()) == 0) {
            throw BizException.stateChanged();
        }

        // ② 写流程实例快照与节点
        FlowInstance fi = new FlowInstance();
        fi.setApplicationId(appId);
        fi.setTemplateId(tpl.getId());
        fi.setTemplateVersionId(ver.getId());
        fi.setVersionNo(ver.getVersionNo());
        fi.setSnapshot(Jsons.tree(snapshot(tpl, ver, data, plan)));
        instanceMapper.insert(fi);

        FlowNodeInstance firstNode = null;
        for (PlannedNode p : plan) {
            FlowNodeInstance n = new FlowNodeInstance();
            n.setFlowInstanceId(fi.getId());
            n.setApplicationId(appId);
            n.setSeq(p.seq());
            n.setNodeKey(p.def().getNodeKey());
            n.setName(p.def().getName());
            n.setMode(p.def().modeOrDefault());
            n.setStatus(p.effective() ? FlowNodeInstance.WAITING : FlowNodeInstance.SKIPPED);
            n.setApproverRule(p.def().getApproverRule());
            n.setConditionExpr(p.def().getCondition());
            n.setConditionResult(p.conditionResult());
            n.setEffective(p.effective());
            n.setTimeoutHours(p.def().getTimeoutHours());
            if (p.resolution() != null) {
                n.setAssigneeId(p.resolution().first());
                n.setCandidateIds(p.resolution().assignees());
                n.setRequiredCount(p.resolution().requiredCount());
                n.setResolveNote(p.resolution().note());
            } else {
                n.setCandidateIds(List.of());
                n.setRequiredCount(1);
            }
            n.setApprovedCount(0);
            nodeMapper.insert(n);
            if (p == first) {
                firstNode = n;
            }
        }

        // ③ 只为第一个有效节点创建待办
        Application fresh = appMapper.selectById(appId);
        List<ApprovalTask> tasks = activate(firstNode);
        appendLog(fresh, null, null, u, "SUBMIT", null, "DRAFT", "IN_APPROVAL", fi.getVersionNo());
        for (ApprovalTask t : tasks) {
            notifyService.taskAssigned(fresh, t.getId(), t.getAssigneeId(), firstNode.getName(), u.realName());
        }
        return result(fresh);
    }

    /** 按模板版本求值节点条件、解析审批人。lenient 时不抛异常，把问题记在 error 中（用于路径预览） */
    List<PlannedNode> plan(ProcessTemplateVersion ver, BizHandler.SubmitData data, Long applicantId, Long deptId,
                           boolean lenient) {
        List<NodeDef> defs = ver.getNodeConfig().getNodes();
        List<PlannedNode> result = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < defs.size(); i++) {
            NodeDef def = defs.get(i);
            Boolean cond = def.getCondition() == null || def.getCondition().getRules() == null
                    || def.getCondition().getRules().isEmpty()
                    ? null : evaluator.evaluate(def.getCondition(), data.variables());
            boolean effective = cond == null || cond;
            String condText = evaluator.describe(def.getCondition(), data.labels());
            ApproverResolver.Resolution res = null;
            String error = null;
            if (effective) {
                try {
                    res = resolver.resolve(def, applicantId, deptId);
                } catch (ApproverResolver.UnresolvedException e) {
                    error = e.getMessage();
                    errors.add(error);
                }
            }
            result.add(new PlannedNode(i + 1, def, cond, effective, condText, res, error));
        }
        if (!lenient && !errors.isEmpty()) {
            throw new BizException(ErrorCode.BIZ_RULE, errors.get(0), errors.stream()
                    .map(m -> new edu.zju.eas.response.FieldError(null, "FLOW_APPROVER_UNRESOLVED", m)).toList());
        }
        return result;
    }

    private Map<String, Object> snapshot(ProcessTemplate tpl, ProcessTemplateVersion ver, BizHandler.SubmitData data,
                                         List<PlannedNode> plan) {
        Map<Long, UserBrief> briefs = users.briefs(plan.stream()
                .filter(p -> p.resolution() != null)
                .flatMap(p -> p.resolution().assignees().stream()).toList());
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (PlannedNode p : plan) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("seq", p.seq());
            n.put("nodeKey", p.def().getNodeKey());
            n.put("name", p.def().getName());
            n.put("mode", p.def().modeOrDefault());
            n.put("conditionText", p.conditionText());
            n.put("rule", p.def().getApproverRule());
            if (p.def().getFallbackRule() != null) {
                n.put("fallbackRule", p.def().getFallbackRule());
            }
            if (p.def().getCondition() != null) {
                n.put("condition", p.def().getCondition());
                n.put("conditionResult", p.conditionResult());
            }
            n.put("effective", p.effective());
            if (p.resolution() != null) {
                n.put("assignee", briefJson(briefs.get(p.resolution().first())));
                if (p.resolution().assignees().size() > 1) {
                    n.put("candidates", p.resolution().assignees().stream().map(id -> briefJson(briefs.get(id))).toList());
                    n.put("requiredCount", p.resolution().requiredCount());
                }
                n.put("resolveNote", p.resolution().note());
            }
            nodes.add(n);
        }
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("templateCode", tpl.getCode());
        s.put("versionNo", ver.getVersionNo());
        s.put("resolvedAt", OffsetDateTime.now(clock).toString());
        Map<String, Object> vars = new LinkedHashMap<>();
        data.variables().forEach((k, v) -> vars.put(k, v == null ? null : v instanceof Number ? v : v.toString()));
        s.put("variables", vars);
        s.put("nodes", nodes);
        return s;
    }

    private static Map<String, Object> briefJson(UserBrief b) {
        if (b == null) {
            return null;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.id());
        m.put("name", b.realName());
        m.put("deptName", b.deptName());
        return m;
    }

    /** 审批路径预览：按草稿当前内容求值，不落库 */
    public PathPreview preview(Application app, CurrentUser u) {
        SysUser applicant = userMapper.selectById(u.id());
        ProcessTemplate tpl = templateMapper.selectById(app.getTemplateId());
        ProcessTemplateVersion ver = versionMapper.selectById(tpl.getCurrentVersionId());
        BizHandler.SubmitData data = handler(app.getType()).previewVariables(app);
        List<PlannedNode> plan = plan(ver, data, u.id(), applicant.getDeptId(), true);
        Map<Long, UserBrief> briefs = users.briefs(plan.stream().filter(p -> p.resolution() != null)
                .flatMap(p -> p.resolution().assignees().stream()).toList());
        List<PathPreview.Node> nodes = plan.stream().map(p -> new PathPreview.Node(p.seq(), p.def().getName(),
                p.def().modeOrDefault(), p.effective(), p.conditionText(),
                p.resolution() == null ? null : briefs.get(p.resolution().first()),
                p.resolution() == null ? List.of() : p.resolution().assignees().stream().map(briefs::get).toList(),
                p.resolution() == null ? p.error() : p.resolution().note())).toList();
        List<String> errors = plan.stream().map(PlannedNode::error).filter(e -> e != null).toList();
        return new PathPreview(nodes, errors);
    }

    /** 模板启用、适用于申请人部门 */
    public ProcessTemplate requireUsableTemplate(Long templateId, Long deptId) {
        ProcessTemplate tpl = templateMapper.selectById(templateId);
        if (tpl == null || !Boolean.TRUE.equals(tpl.getEnabled()) || tpl.getCurrentVersionId() == null) {
            throw BizException.rule(null, "TPL_DISABLED", "该流程模板已停用，不能新建或提交");
        }
        if (!templateDeptMapper.appliesTo(templateId, deptId)) {
            throw BizException.rule(null, "TPL_NOT_APPLICABLE", "该流程模板不适用于您所在的部门");
        }
        return tpl;
    }

    // =====================================================================
    // 批准 / 驳回
    // =====================================================================

    @Transactional
    public ActionResult approve(Long taskId, CurrentUser u, ApproveRequest req) {
        ApprovalTask task = taskMapper.selectById(taskId);
        if (task == null || !task.getAssigneeId().equals(u.id())) {
            throw new BizException(ErrorCode.NOT_CURRENT_APPROVER);
        }
        Application app = appMapper.selectById(task.getApplicationId());
        if (app.getApplicantId().equals(u.id())) {
            throw new BizException(ErrorCode.SELF_APPROVAL_FORBIDDEN);
        }
        FlowNodeInstance node = nodeMapper.selectById(task.getNodeInstanceId());
        FlowNodeInstance next = nodeMapper.nextEffective(node.getFlowInstanceId(), node.getSeq());
        boolean isLast = next == null;
        String comment = blankToNull(req.comment());

        if (NodeDef.SINGLE.equals(node.getMode())) {
            // ① 先锁申请行：状态、版本、当前节点都对得上才更新
            if (appMapper.advance(app.getId(), req.appVersion(), node.getSeq(), isLast ? null : next.getSeq(),
                    isLast, u.id()) == 0) {
                throw BizException.stateChanged();                       // 40901
            }
            // ② 再完成任务：只能是本人的 PENDING 任务
            if (taskMapper.complete(taskId, u.id(), ApprovalTask.APPROVED, comment) == 0) {
                throw new BizException(ErrorCode.TASK_ALREADY_PROCESSED); // 40902
            }
            nodeMapper.finish(node.getId(), FlowNodeInstance.APPROVED);
            return afterNodeApproved(app.getId(), node, next, task, u, comment);
        }

        // 会签 / 或签：先锁申请行并校验，再完成本人待办，原子累加计数
        if (appMapper.lockForApproval(app.getId(), req.appVersion(), node.getSeq(), u.id()) == 0) {
            throw BizException.stateChanged();
        }
        if (taskMapper.complete(taskId, u.id(), ApprovalTask.APPROVED, comment) == 0) {
            throw new BizException(ErrorCode.TASK_ALREADY_PROCESSED);
        }
        Integer approved = nodeMapper.incrementApproved(node.getId());
        if (approved == null) {
            throw BizException.stateChanged();
        }
        boolean reached = NodeDef.OR_SIGN.equals(node.getMode()) || approved >= node.getRequiredCount();
        if (!reached) {
            // 只有达到阈值的事务推进申请，其余事务只更新自己的待办
            Application fresh = appMapper.selectById(app.getId());
            appendLog(fresh, node, task, u, "APPROVE", comment, "IN_APPROVAL", "IN_APPROVAL", versionNo(node));
            return result(fresh);
        }
        appMapper.advanceLocked(app.getId(), node.getSeq(), isLast ? null : next.getSeq(), isLast);
        nodeMapper.finish(node.getId(), FlowNodeInstance.APPROVED);
        if (NodeDef.OR_SIGN.equals(node.getMode())) {
            Application fresh = appMapper.selectById(app.getId());
            for (ApprovalTask other : taskMapper.cancelPendingOfNode(node.getId())) {
                notifyService.taskCanceled(fresh, other.getId(), other.getAssigneeId(),
                        "或签节点“" + node.getName() + "”已由 " + u.realName() + " 处理");
            }
        }
        return afterNodeApproved(app.getId(), node, next, task, u, comment);
    }

    private ActionResult afterNodeApproved(Long appId, FlowNodeInstance node, FlowNodeInstance next, ApprovalTask task,
                                           CurrentUser u, String comment) {
        Application fresh = appMapper.selectById(appId);
        if (next == null) {
            appendLog(fresh, node, task, u, "APPROVE", comment, "IN_APPROVAL", "APPROVED", versionNo(node));
            notifyService.appApproved(fresh, u.realName());
        } else {
            List<ApprovalTask> tasks = activate(next);
            appendLog(fresh, node, task, u, "APPROVE", comment, "IN_APPROVAL", "IN_APPROVAL", versionNo(node));
            notifyService.nodeApproved(fresh, task.getId(), node.getName(), u.realName());
            String applicantName = users.name(fresh.getApplicantId());
            for (ApprovalTask t : tasks) {
                notifyService.taskAssigned(fresh, t.getId(), t.getAssigneeId(), next.getName(), applicantName);
            }
        }
        return result(fresh);
    }

    @Transactional
    public ActionResult reject(Long taskId, CurrentUser u, RejectRequest req) {
        ApprovalTask task = taskMapper.selectById(taskId);
        if (task == null || !task.getAssigneeId().equals(u.id())) {
            throw new BizException(ErrorCode.NOT_CURRENT_APPROVER);
        }
        Application app = appMapper.selectById(task.getApplicationId());
        if (app.getApplicantId().equals(u.id())) {
            throw new BizException(ErrorCode.SELF_APPROVAL_FORBIDDEN);
        }
        FlowNodeInstance node = nodeMapper.selectById(task.getNodeInstanceId());
        String reason = req.comment().trim();
        if (appMapper.reject(app.getId(), req.appVersion(), node.getSeq(), u.id()) == 0) {
            throw BizException.stateChanged();
        }
        if (taskMapper.complete(taskId, u.id(), ApprovalTask.REJECTED, reason) == 0) {
            throw new BizException(ErrorCode.TASK_ALREADY_PROCESSED);
        }
        nodeMapper.finish(node.getId(), FlowNodeInstance.REJECTED);
        Application fresh = appMapper.selectById(app.getId());
        for (ApprovalTask other : taskMapper.cancelPendingOfNode(node.getId())) {
            notifyService.taskCanceled(fresh, other.getId(), other.getAssigneeId(),
                    "节点“" + node.getName() + "”已被 " + u.realName() + " 驳回");
        }
        // 驳回即结束本次审批，后续节点标记为 NOT_REACHED
        nodeMapper.markNotReached(node.getFlowInstanceId(), node.getSeq());
        appendLog(fresh, node, task, u, "REJECT", reason, "IN_APPROVAL", "REJECTED", versionNo(node));
        notifyService.appRejected(fresh, u.realName(), node.getName(), reason);
        return result(fresh);
    }

    // =====================================================================
    // 撤回
    // =====================================================================

    @Transactional
    public ActionResult withdraw(Long appId, int appVersion, CurrentUser u) {
        Application app = appMapper.selectById(appId);
        if (app == null || !app.getApplicantId().equals(u.id())) {
            throw BizException.notFound();
        }
        if (appMapper.withdraw(appId, u.id(), appVersion) == 0) {
            throw BizException.stateChanged();   // 例如审批人刚批准了最后一个节点
        }
        List<ApprovalTask> canceled = taskMapper.cancelPendingOfApp(appId);
        FlowInstance fi = instanceOf(appId);
        nodeMapper.cancelOpen(fi.getId());
        Application fresh = appMapper.selectById(appId);
        appendLog(fresh, null, null, u, "WITHDRAW", null, "IN_APPROVAL", "WITHDRAWN", fi.getVersionNo());
        for (ApprovalTask t : canceled) {
            notifyService.taskCanceled(fresh, t.getId(), t.getAssigneeId(), "申请人已撤回，该待办失效");
        }
        return result(fresh);
    }

    // =====================================================================
    // 转办（管理员）：唯一能修改已提交实例审批人的途径
    // =====================================================================

    @Transactional
    @Audited(action = "TASK_TRANSFER", targetType = "TASK")
    public void transfer(Long taskId, TransferRequest req, CurrentUser admin) {
        ApprovalTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw BizException.notFound();
        }
        if (!ApprovalTask.PENDING.equals(task.getStatus())) {
            throw new BizException(ErrorCode.TASK_ALREADY_PROCESSED);
        }
        Application app = appMapper.selectById(task.getApplicationId());
        SysUser to = userMapper.selectById(req.toUserId());
        if (to == null || !SysUser.ACTIVE.equals(to.getStatus())) {
            throw BizException.rule("toUserId", "TRANSFER_TARGET_INVALID", "新审批人不存在或未启用");
        }
        if (to.getId().equals(app.getApplicantId())) {
            throw BizException.rule("toUserId", "TRANSFER_TARGET_INVALID", "新审批人不能是申请人");
        }
        if (to.getId().equals(task.getAssigneeId())) {
            throw BizException.rule("toUserId", "TRANSFER_TARGET_INVALID", "新审批人与原审批人相同");
        }
        if (flowQueryMapper.isAdminOnly(to.getId())) {
            throw BizException.rule("toUserId", "TRANSFER_TARGET_INVALID", "不能转给只有管理员角色的账号");
        }
        if (appMapper.lockInApproval(app.getId()) == 0) {
            throw BizException.stateChanged();
        }
        if (taskMapper.markTransferred(taskId, req.reason()) == 0) {
            throw new BizException(ErrorCode.TASK_ALREADY_PROCESSED);
        }
        FlowNodeInstance node = nodeMapper.selectById(task.getNodeInstanceId());
        ApprovalTask newTask = new ApprovalTask();
        newTask.setApplicationId(app.getId());
        newTask.setNodeInstanceId(node.getId());
        newTask.setAssigneeId(to.getId());
        newTask.setStatus(ApprovalTask.PENDING);
        taskMapper.insert(newTask);   // 新审批人在该节点已有待办时唯一索引冲突 → 40901

        List<Long> candidates = new ArrayList<>(node.getCandidateIds() == null ? List.of() : node.getCandidateIds());
        candidates.replaceAll(id -> id.equals(task.getAssigneeId()) ? to.getId() : id);
        nodeMapper.update(null, Wrappers.<FlowNodeInstance>lambdaUpdate()
                .set(task.getAssigneeId().equals(node.getAssigneeId()), FlowNodeInstance::getAssigneeId, to.getId())
                .set(FlowNodeInstance::getCandidateIds, candidates, "typeHandler=edu.zju.eas.common.mybatis.JsonbHandlers$LongListHandler")
                .eq(FlowNodeInstance::getId, node.getId()));

        AssigneeHistory h = new AssigneeHistory();
        h.setNodeInstanceId(node.getId());
        h.setFromTaskId(taskId);
        h.setToTaskId(newTask.getId());
        h.setFromUserId(task.getAssigneeId());
        h.setToUserId(to.getId());
        h.setReason(req.reason());
        h.setOperatorId(admin.id());
        historyMapper.insert(h);

        String fromName = users.name(task.getAssigneeId());
        appendLog(app, node, task, admin, "TRANSFER", "由 " + fromName + " 转给 " + to.getRealName() + "：" + req.reason(),
                "IN_APPROVAL", "IN_APPROVAL", versionNo(node));
        AuditTrail.record(taskId, Map.of("assigneeId", task.getAssigneeId(), "assigneeName", fromName),
                Map.of("assigneeId", to.getId(), "assigneeName", to.getRealName(), "newTaskId", newTask.getId(),
                        "appNo", app.getAppNo()), req.reason());

        String content = "节点“" + node.getName() + "”的审批人由 " + fromName + " 变更为 " + to.getRealName()
                + "（原因：" + req.reason() + "）";
        notifyService.taskTransferred(app, newTask.getId(), to.getId(), content);
        notifyService.taskTransferred(app, newTask.getId(), task.getAssigneeId(), content);
        notifyService.taskTransferred(app, newTask.getId(), app.getApplicantId(), content);
    }

    // =====================================================================
    // 催办【增强】
    // =====================================================================

    public record UrgeResult(boolean urged, OffsetDateTime nextAllowedAt) {
    }

    @Transactional
    public UrgeResult urge(Long appId, CurrentUser u) {
        Application app = appMapper.selectById(appId);
        if (app == null || !app.getApplicantId().equals(u.id())) {
            throw BizException.notFound();
        }
        if (appMapper.lockInApproval(appId) == 0) {
            throw BizException.stateChanged();
        }
        FlowNodeInstance node = nodeMapper.activeOf(appId);
        if (node == null) {
            throw BizException.stateChanged();
        }
        long bucket = clock.instant().getEpochSecond() / URGE_BUCKET_SECONDS;
        OffsetDateTime next = OffsetDateTime.ofInstant(Instant.ofEpochSecond((bucket + 1) * URGE_BUCKET_SECONDS),
                ZoneOffset.ofHours(8));
        if (urgeMapper.insertOnce(node.getId(), appId, u.id(), bucket) == null) {
            return new UrgeResult(false, next);
        }
        for (ApprovalTask t : taskMapper.selectList(Wrappers.<ApprovalTask>lambdaQuery()
                .eq(ApprovalTask::getNodeInstanceId, node.getId()).eq(ApprovalTask::getStatus, ApprovalTask.PENDING))) {
            notifyService.urged(app, node.getId(), bucket, t.getAssigneeId(), u.realName());
        }
        return new UrgeResult(true, next);
    }

    public OffsetDateTime nextUrgeAllowedAt(Long appId) {
        FlowNodeInstance node=nodeMapper.activeOf(appId);
        if(node==null)return null;
        long bucket=clock.instant().getEpochSecond()/URGE_BUCKET_SECONDS;
        boolean urged=urgeMapper.selectCount(Wrappers.<edu.zju.eas.model.flow.UrgeRecord>lambdaQuery()
                .eq(edu.zju.eas.model.flow.UrgeRecord::getNodeInstanceId,node.getId())
                .eq(edu.zju.eas.model.flow.UrgeRecord::getTimeBucket,bucket))>0;
        return urged?OffsetDateTime.ofInstant(Instant.ofEpochSecond((bucket+1)*URGE_BUCKET_SECONDS),ZoneOffset.ofHours(8)):null;
    }

    // =====================================================================
    // 内部
    // =====================================================================

    /** 激活节点并为每个审批人创建 PENDING 待办 */
    private List<ApprovalTask> activate(FlowNodeInstance node) {
        nodeMapper.activate(node.getId());
        List<Long> assignees = node.getCandidateIds() != null && !node.getCandidateIds().isEmpty()
                ? node.getCandidateIds() : List.of(node.getAssigneeId());
        List<ApprovalTask> tasks = new ArrayList<>();
        for (Long uid : assignees) {
            ApprovalTask t = new ApprovalTask();
            t.setApplicationId(node.getApplicationId());
            t.setNodeInstanceId(node.getId());
            t.setAssigneeId(uid);
            t.setStatus(ApprovalTask.PENDING);
            taskMapper.insert(t);
            tasks.add(t);
        }
        return tasks;
    }

    private void appendLog(Application app, FlowNodeInstance node, ApprovalTask task, CurrentUser op, String action,
                           String comment, String from, String to, Integer templateVersionNo) {
        ApprovalLog log = new ApprovalLog();
        log.setApplicationId(app.getId());
        log.setNodeInstanceId(node == null ? null : node.getId());
        log.setTaskId(task == null ? null : task.getId());
        log.setNodeName(node == null ? null : node.getName());
        log.setOperatorId(op.id());
        log.setOperatorName(op.realName());
        log.setAction(action);
        log.setComment(comment);
        log.setFromStatus(from);
        log.setToStatus(to);
        log.setAppVersion(app.getVersion());
        log.setTemplateVersionNo(templateVersionNo);
        log.setIp(RequestInfo.ip());
        logMapper.insert(log);
    }

    private Integer versionNo(FlowNodeInstance node) {
        FlowInstance fi = instanceMapper.selectById(node.getFlowInstanceId());
        return fi == null ? null : fi.getVersionNo();
    }

    private FlowInstance instanceOf(Long appId) {
        return instanceMapper.selectOne(Wrappers.<FlowInstance>lambdaQuery().eq(FlowInstance::getApplicationId, appId));
    }

    public ActionResult result(Application app) {
        ActionResult.CurrentNode current = null;
        if ("IN_APPROVAL".equals(app.getStatus())) {
            FlowNodeInstance node = nodeMapper.activeOf(app.getId());
            if (node != null) {
                List<ApprovalTask> pending = taskMapper.selectList(Wrappers.<ApprovalTask>lambdaQuery()
                        .eq(ApprovalTask::getNodeInstanceId, node.getId())
                        .eq(ApprovalTask::getStatus, ApprovalTask.PENDING));
                String names = pending.stream().map(t -> users.name(t.getAssigneeId()))
                        .collect(Collectors.joining("、"));
                current = new ActionResult.CurrentNode(node.getSeq(), node.getName(), names.isEmpty() ? null : names);
            }
        }
        return new ActionResult(app.getId(), app.getStatus(), app.getVersion(), current);
    }

    private BizHandler handler(String type) {
        return handlers.stream().filter(h -> h.type().equals(type)).findFirst()
                .orElseThrow(() -> new IllegalStateException("未知申请类型 " + type));
    }

    Map<String, BizHandler> handlerMap() {
        return handlers.stream().collect(Collectors.toMap(BizHandler::type, Function.identity()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

package edu.zju.eas.service.flow;

import edu.zju.eas.model.org.Department;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.model.template.ApproverRule;
import edu.zju.eas.model.template.NodeDef;
import edu.zju.eas.repository.DepartmentMapper;
import edu.zju.eas.repository.FlowQueryMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 把节点规则解析为具体审批人。解析结果是申请人本人、或规则无法解析出有效审批人（部门未设负责人、
 * 审批人已停用、只有管理员角色）时，按节点的 fallbackRule（默认企业负责人）再解析；仍不行则使用系统配置的
 * 兜底审批人；还不行则提交失败。替代过程写入快照的 resolveNote。
 */
@Component
@RequiredArgsConstructor
public class ApproverResolver {
    private static final Map<String, String> ROLE_NAMES = Map.of(
            Perms.ROLE_DEPT_HEAD, "部门负责人", Perms.ROLE_FINANCE_APPROVER, "财务审批人",
            Perms.ROLE_ENTERPRISE_HEAD, "企业负责人", Perms.ROLE_EMPLOYEE, "员工");

    private final FlowQueryMapper flowQueryMapper;
    private final SysUserMapper userMapper;
    private final DepartmentMapper deptMapper;
    private final SysConfigService configService;

    /** 解析结果：单人节点 assignees 只有一个；会签 / 或签可有多个；requiredCount 为通过所需人数 */
    public record Resolution(List<Long> assignees, int requiredCount, String note) {
        public Long first() {
            return assignees.get(0);
        }
    }

    public static class UnresolvedException extends RuntimeException {
        public UnresolvedException(String message) {
            super(message);
        }
    }

    public Resolution resolve(NodeDef node, Long applicantId, Long deptId) {
        String mode = node.modeOrDefault();
        if (!NodeDef.SINGLE.equals(mode)) {
            List<Long> candidates = candidates(node.getApproverRule(), applicantId);
            if (!candidates.isEmpty()) {
                int required = NodeDef.COUNTERSIGN.equals(mode) ? candidates.size() : 1;
                String note = (NodeDef.COUNTERSIGN.equals(mode) ? "会签：" : "或签：") + candidates.size() + " 人";
                return new Resolution(candidates, required, note);
            }
            // 没有可用的多人审批人时退化为单人，并走替代规则
        }
        Attempt primary = single(node.getApproverRule(), applicantId, deptId);
        if (primary.userId != null) {
            return new Resolution(List.of(primary.userId), 1, primary.label);
        }
        ApproverRule fallback = node.getFallbackRule() != null ? node.getFallbackRule()
                : ApproverRule.role(Perms.ROLE_ENTERPRISE_HEAD);
        Attempt alt = single(fallback, applicantId, deptId);
        if (alt.userId != null) {
            return new Resolution(List.of(alt.userId), 1, primary.reason + "，按替代规则由" + alt.label + "审批");
        }
        Attempt last = configured(applicantId);
        if (last.userId != null) {
            return new Resolution(List.of(last.userId), 1,
                    primary.reason + "，替代规则仍无法解析，由兜底审批人（" + last.label + "）审批");
        }
        throw new UnresolvedException("节点“" + node.getName() + "”无法确定审批人：" + primary.reason);
    }

    /** 一次单人解析的结果：成功时 userId 非空；失败时 reason 说明原因 */
    private record Attempt(Long userId, String label, String reason) {
        static Attempt ok(Long userId, String label) {
            return new Attempt(userId, label, null);
        }

        static Attempt fail(String reason) {
            return new Attempt(null, null, reason);
        }
    }

    private Attempt single(ApproverRule rule, Long applicantId, Long deptId) {
        if (rule == null || rule.getType() == null) {
            return Attempt.fail("审批人规则未配置");
        }
        return switch (rule.getType()) {
            case ApproverRule.APPLICANT_DEPT_HEAD -> {
                Department d = deptId == null ? null : deptMapper.selectById(deptId);
                String deptName = d == null ? "申请人部门" : d.getName();
                Long head = deptId == null ? null : flowQueryMapper.headOf(deptId);
                yield check(head, applicantId, deptName + "负责人", "申请人为" + deptName + "负责人",
                        deptName + "未设置负责人");
            }
            case ApproverRule.ROLE -> {
                String roleName = ROLE_NAMES.getOrDefault(rule.getRoleCode(), rule.getRoleCode());
                Long uid = rule.getRoleCode() == null ? null : flowQueryMapper.primaryHandlerOf(rule.getRoleCode());
                yield check(uid, applicantId, roleName + "主办人", "申请人为" + roleName + "主办人",
                        roleName + "没有主办人");
            }
            case ApproverRule.SPECIFIED_USER -> {
                Long uid = rule.getUserId() != null ? rule.getUserId()
                        : rule.getUserIds() != null && !rule.getUserIds().isEmpty() ? rule.getUserIds().get(0) : null;
                yield check(uid, applicantId, "指定审批人", "申请人为指定审批人", "指定审批人不存在");
            }
            default -> Attempt.fail("未知的审批人规则 " + rule.getType());
        };
    }

    private Attempt check(Long uid, Long applicantId, String label, String selfReason, String missingReason) {
        if (uid == null) {
            return Attempt.fail(missingReason);
        }
        if (uid.equals(applicantId)) {
            return Attempt.fail(selfReason);   // 禁止自审
        }
        SysUser u = userMapper.selectById(uid);
        if (u == null || !SysUser.ACTIVE.equals(u.getStatus())) {
            return Attempt.fail(label + "已停用");
        }
        if (flowQueryMapper.isAdminOnly(uid)) {
            return Attempt.fail(label + "只有系统管理员角色");
        }
        return Attempt.ok(uid, label + " " + u.getRealName());
    }

    /** 系统配置的兜底审批人：DEPT:部门编码 或 USER:用户ID */
    private Attempt configured(Long applicantId) {
        String v = configService.getString(SysConfigService.FALLBACK_APPROVER, "");
        Long uid = null;
        String label = "兜底审批人";
        if (v.startsWith("DEPT:")) {
            uid = flowQueryMapper.headOfCode(v.substring(5).trim());
        } else if (v.startsWith("USER:")) {
            try {
                uid = Long.valueOf(v.substring(5).trim());
            } catch (NumberFormatException ignored) {
                uid = null;
            }
        }
        return check(uid, applicantId, label, "兜底审批人为申请人本人", "未配置兜底审批人");
    }

    private List<Long> candidates(ApproverRule rule, Long applicantId) {
        if (rule == null) {
            return List.of();
        }
        List<Long> raw = new ArrayList<>();
        if (ApproverRule.SPECIFIED_USER.equals(rule.getType())) {
            if (rule.getUserIds() != null) {
                raw.addAll(rule.getUserIds());
            } else if (rule.getUserId() != null) {
                raw.add(rule.getUserId());
            }
        } else if (ApproverRule.ROLE.equals(rule.getType()) && rule.getRoleCode() != null) {
            raw.addAll(flowQueryMapper.holdersOf(rule.getRoleCode()));
        }
        LinkedHashSet<Long> result = new LinkedHashSet<>();
        for (Long uid : raw) {
            if (uid == null || uid.equals(applicantId)) {
                continue;
            }
            SysUser u = userMapper.selectById(uid);
            if (u != null && SysUser.ACTIVE.equals(u.getStatus()) && !flowQueryMapper.isAdminOnly(uid)) {
                result.add(uid);
            }
        }
        return List.copyOf(result);
    }
}

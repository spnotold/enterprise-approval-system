package edu.zju.eas.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import edu.zju.eas.model.app.Application;
import edu.zju.eas.model.app.ExpenseRelation;
import edu.zju.eas.model.common.Attachment;
import edu.zju.eas.repository.*;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.Perms;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 所有正文、关联摘要与文件入口使用同一资源权限边界。 */
@Service
@RequiredArgsConstructor
public class AccessPolicy {
    private final ApprovalTaskMapper tasks;
    private final ApplicationMapper applications;
    private final ExpenseRelationMapper relations;

    public boolean canViewApplication(CurrentUser u, Application a) {
        if (a == null || a.getDeletedAt() != null) return false;
        if (u.id().equals(a.getApplicantId())) return true;
        if ("DRAFT".equals(a.getStatus())) return false;
        // 管理员读正文需要显式的业务正文授权，管理角色本身不赋予查看权。
        if (u.isAdmin()) return u.covers(Perms.GRANT_BIZ_CONTENT_READ, a.getDeptId());
        return tasks.existsByAppAndAssignee(a.getId(), u.id())
            || (u.has(Perms.APP_READ_DEPT) && u.isHeadOf(a.getDeptId()))
            || u.covers(Perms.GRANT_APP_READ, a.getDeptId());
    }

    public boolean canViewAsLinked(CurrentUser u, Application a) {
        if (a == null || a.getDeletedAt() != null || !"APPROVED".equals(a.getStatus())
            || !("TRAVEL".equals(a.getType()) || "PURCHASE".equals(a.getType()))) return false;
        return relations.selectList(Wrappers.<ExpenseRelation>lambdaQuery()
            .eq(ExpenseRelation::getRelatedApplicationId, a.getId())).stream()
            .map(r -> applications.selectById(r.getExpenseApplicationId()))
            .anyMatch(parent -> parent != null && !"DRAFT".equals(parent.getStatus())
                && canViewApplication(u, parent));
    }

    public boolean canReadAttachment(CurrentUser u, Attachment file) {
        if (file == null || Attachment.DELETED.equals(file.getStatus())) return false;
        if (Attachment.TEMP.equals(file.getStatus())) return u.id().equals(file.getUploaderId());
        Application a = applications.selectById(file.getApplicationId());
        // 关联摘要查看权从不扩展到原申请附件。
        return canReadApplicationAttachments(u, a);
    }

    public boolean canReadApplicationAttachments(CurrentUser u, Application a) {
        if (a == null || a.getDeletedAt() != null) return false;
        if (u.id().equals(a.getApplicantId())) return true;
        if ("DRAFT".equals(a.getStatus())) return false;
        if (u.isAdmin()) return u.covers(Perms.GRANT_BIZ_CONTENT_READ, a.getDeptId());
        return tasks.existsByAppAndAssignee(a.getId(), u.id())
            || u.covers(Perms.GRANT_APP_READ, a.getDeptId());
    }
}

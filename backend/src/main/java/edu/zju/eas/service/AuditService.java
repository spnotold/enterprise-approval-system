package edu.zju.eas.service;

import edu.zju.eas.common.Jsons;
import edu.zju.eas.common.RequestInfo;
import edu.zju.eas.model.app.Application;
import edu.zju.eas.model.common.AuditLog;
import edu.zju.eas.repository.AuditLogMapper;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** 管理审计日志：只追加（表上有触发器，运行账号也没有 UPDATE / DELETE 权限） */
@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogMapper auditLogMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void write(String action, String targetType, String targetId, Object before, Object after, String reason) {
        CurrentUser op = SecurityUtils.currentOrNull();
        write(op == null ? null : op.id(), op == null ? null : op.realName(), action, targetType, targetId,
                before, after, reason);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void write(Long operatorId, String operatorName, String action, String targetType, String targetId,
                      Object before, Object after, String reason) {
        AuditLog log = new AuditLog();
        log.setOperatorId(operatorId);
        log.setOperatorName(operatorName);
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setBeforeData(Jsons.tree(before));
        log.setAfterData(Jsons.tree(after));
        log.setReason(reason);
        log.setIp(RequestInfo.ip());
        auditLogMapper.insert(log);
    }

    /** 管理员凭 BIZ_CONTENT_READ / APP_READ 授权查看业务正文时留痕；独立事务，查询失败也不影响 */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logBizAccess(CurrentUser u, Application app, String what) {
        write(u.id(), u.realName(), "BIZ_CONTENT_READ", "APPLICATION", String.valueOf(app.getId()), null,
                Map.of("appNo", app.getAppNo(), "content", what), null);
    }

    /** 管理员按授权范围列表查询业务数据（标题、金额等）时留痕，记录本页返回的申请 ID */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logBizList(CurrentUser u, String scope, List<Long> applicationIds) {
        write(u.id(), u.realName(), "BIZ_CONTENT_READ", "APPLICATION_LIST", scope, null,
                Map.of("applicationIds", applicationIds), null);
    }
}

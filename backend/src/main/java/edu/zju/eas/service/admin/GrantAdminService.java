package edu.zju.eas.service.admin;

import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.model.org.DataScopeGrant;
import edu.zju.eas.repository.DataScopeGrantMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.PageResponse;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import static edu.zju.eas.service.admin.AdminSupport.*;

@Service
@RequiredArgsConstructor
public class GrantAdminService {
    private final JdbcTemplate jdbc;
    private final DataScopeGrantMapper mapper;
    private final DepartmentService departments;
    private final AdminSupport support;
    private final AuditService audit;
    private final Clock clock;
    private static final String SELECT="""
        SELECT g.*,u.real_name user_name,d.name dept_name,o.real_name granted_by_name,v.real_name revoked_by_name,
               (g.revoked_at IS NULL AND g.valid_from<=statement_timestamp() AND (g.valid_until IS NULL OR g.valid_until>statement_timestamp())) active
        FROM data_scope_grant g JOIN sys_user u ON u.id=g.user_id
        LEFT JOIN department d ON d.id=g.dept_id JOIN sys_user o ON o.id=g.granted_by
        LEFT JOIN sys_user v ON v.id=g.revoked_by
        """;
    private final org.springframework.jdbc.core.RowMapper<GrantView> row=(r,n)->new GrantView(r.getLong("id"),r.getLong("user_id"),r.getString("user_name"),r.getString("permission_code"),r.getString("scope_type"),id(r,"dept_id"),r.getString("dept_name"),time(r,"valid_from"),time(r,"valid_until"),r.getString("reason"),r.getString("granted_by_name"),time(r,"created_at"),time(r,"revoked_at"),r.getString("revoked_by_name"),r.getBoolean("active"));

    public PageResponse<GrantView> list(int page,int size,Long userId,boolean activeOnly) {
        require(Perms.ADMIN_GRANT); page=page(page);size=size(size);
        String where=" WHERE 1=1"; List<Object> args=new ArrayList<>();
        if (userId!=null) { where+=" AND g.user_id=?";args.add(userId); }
        if (activeOnly) where+=" AND g.revoked_at IS NULL AND g.valid_from<=statement_timestamp() AND (g.valid_until IS NULL OR g.valid_until>statement_timestamp())";
        long count=jdbc.queryForObject("SELECT count(*) FROM data_scope_grant g"+where,Long.class,args.toArray());
        args.add(size);args.add((long)(page-1)*size);
        return PageResponse.of(jdbc.query(SELECT+where+" ORDER BY g.id DESC LIMIT ? OFFSET ?",row,args.toArray()),count,page,size);
    }
    private GrantView view(Long id) {
        return jdbc.query(SELECT+" WHERE g.id=?",row,id).stream().findFirst().orElseThrow(BizException::notFound);
    }
    @Transactional
    public GrantView create(GrantCreate req) {
        var op=require(Perms.ADMIN_GRANT);support.lock();
        String reason=requiredReason(req.reason());
        if (req.permissionCode()==null || !List.of(Perms.GRANT_APP_READ,Perms.GRANT_FIN_STATS_READ,Perms.GRANT_BIZ_CONTENT_READ).contains(req.permissionCode()))
            throw BizException.rule("permissionCode","GRANT_INVALID","不支持的授权权限");
        if (req.scopeType()==null || !List.of("DEPT","ALL").contains(req.scopeType()) || "DEPT".equals(req.scopeType())!=(req.deptId()!=null))
            throw BizException.rule("scopeType","GRANT_SCOPE_INVALID","部门范围必须指定部门，全局范围不得指定部门");
        Boolean active=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM sys_user WHERE id=? AND status='ACTIVE')",Boolean.class,req.userId());
        if (!Boolean.TRUE.equals(active)) throw BizException.rule("userId","GRANT_USER_INVALID","只能授权已启用用户");
        if (req.deptId()!=null) departments.requireEnabled(req.deptId());
        OffsetDateTime from=req.validFrom()==null?OffsetDateTime.now(clock):req.validFrom();
        if (req.validUntil()!=null && (!req.validUntil().isAfter(from) || !req.validUntil().isAfter(OffsetDateTime.now(clock))))
            throw BizException.rule("validUntil","GRANT_PERIOD_INVALID","授权截止时间必须晚于开始时间及当前时间");
        DataScopeGrant g=new DataScopeGrant();g.setUserId(req.userId());g.setPermissionCode(req.permissionCode());
        g.setScopeType(req.scopeType());g.setDeptId(req.deptId());g.setValidFrom(from);g.setValidUntil(req.validUntil());
        g.setReason(reason);g.setGrantedBy(op.id());mapper.insert(g);
        support.invalidate(req.userId(),false);GrantView result=view(g.getId());
        audit.write("GRANT_CREATE","DATA_SCOPE_GRANT",g.getId().toString(),null,result,reason);return result;
    }
    @Transactional
    public GrantView revoke(Long id,String reason) {
        var op=require(Perms.ADMIN_GRANT);support.lock();GrantView before=view(id);
        reason=requiredReason(reason);
        if (before.revokedAt()!=null) throw BizException.stateChanged();
        if (jdbc.update("UPDATE data_scope_grant SET revoked_at=now(),revoked_by=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL",op.id(),reason,id)!=1) throw BizException.stateChanged();
        support.invalidate(before.userId(),false);GrantView after=view(id);
        audit.write("GRANT_REVOKE","DATA_SCOPE_GRANT",id.toString(),before,after,reason);return after;
    }
}

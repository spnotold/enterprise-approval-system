package edu.zju.eas.service.admin;

import edu.zju.eas.common.Sqls;
import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.PageResponse;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.DepartmentService;
import edu.zju.eas.service.notify.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.util.*;
import static edu.zju.eas.service.admin.AdminSupport.*;

@Service
@RequiredArgsConstructor
public class UserAdminService {
    private final JdbcTemplate jdbc;
    private final SysUserMapper users;
    private final DepartmentService departments;
    private final AdminSupport support;
    private final AuditService audit;
    private final PasswordEncoder passwords;
    private final NotificationService notifications;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional(readOnly=true)
    public PageResponse<AdminUser> list(int page, int size, String status, Long deptId, String keyword) {
        require(Perms.ADMIN_USER);
        page=page(page); size=size(size);
        List<Object> args=new ArrayList<>(); String where=" WHERE 1=1";
        if (status!=null && !status.isBlank()) { where+=" AND status=?"; args.add(status); }
        if (deptId!=null) { where+=" AND dept_id=?"; args.add(deptId); }
        String k=Sqls.likeKeyword(keyword);
        if (k!=null) { where+=" AND (username ILIKE ? OR real_name ILIKE ? OR email ILIKE ?)"; args.addAll(List.of(k,k,k)); }
        long total=jdbc.queryForObject("SELECT count(*) FROM sys_user"+where,Long.class,args.toArray());
        args.add(size); args.add((long)(page-1)*size);
        List<Long> ids=jdbc.queryForList("SELECT id FROM sys_user"+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",Long.class,args.toArray());
        return PageResponse.of(ids.stream().map(this::view).toList(),total,page,size);
    }

    public AdminUser get(Long id) { require(Perms.ADMIN_USER); return view(id); }

    AdminUser view(Long id) {
        // JdbcTemplate 写入不会清除 MyBatis 一级缓存，审计和响应必须直接读取本事务的新值。
        SysUser u=jdbc.query("SELECT * FROM sys_user WHERE id=?",org.springframework.jdbc.core.BeanPropertyRowMapper.newInstance(SysUser.class),id)
                .stream().findFirst().orElseThrow(BizException::notFound);
        List<RoleBrief> roles=jdbc.query("SELECT r.id,r.code,r.name,ur.is_primary_handler FROM user_role ur JOIN role r ON r.id=ur.role_id WHERE ur.user_id=? ORDER BY r.sort_order,r.id",
                (r,n)->new RoleBrief(r.getLong("id"),r.getString("code"),r.getString("name"),r.getBoolean("is_primary_handler")),id);
        return new AdminUser(u.getId(),u.getUsername(),u.getRealName(),u.getEmail(),u.getStatus(),u.getDeptId(),
                departments.name(u.getDeptId()),u.getRequestedDeptId(),departments.name(u.getRequestedDeptId()),roles,
                u.getCreatedAt(),u.getLastLoginAt(),u.getLockedUntil());
    }

    public List<RoleView> roles() {
        require(Perms.ADMIN_USER);
        return jdbc.query("SELECT * FROM role ORDER BY sort_order,id",(r,n)-> {
            Long id=r.getLong("id");
            var permissions=jdbc.query("SELECT p.code,p.name FROM role_permission rp JOIN permission p ON p.id=rp.permission_id WHERE rp.role_id=? ORDER BY p.code",
                    (p,i)->new PermissionView(p.getString("code"),p.getString("name")),id);
            var members=jdbc.query("SELECT u.id,u.real_name,d.name dept_name,ur.is_primary_handler FROM user_role ur JOIN sys_user u ON u.id=ur.user_id LEFT JOIN department d ON d.id=u.dept_id WHERE ur.role_id=? ORDER BY u.id",
                    (m,i)->new RoleMember(m.getLong("id"),m.getString("real_name"),m.getString("dept_name"),m.getBoolean("is_primary_handler")),id);
            return new RoleView(id,r.getString("code"),r.getString("name"),r.getString("description"),permissions,members);
        });
    }

    /** 所有用户/角色管理写操作由同一个事务锁保护，防止并发移除最后一位管理员。 */
    @Transactional
    public AdminUser change(Long id, String action, Long deptId, String roleCode, String suppliedReason) {
        CurrentUser op=require(Perms.ADMIN_USER); support.lock();
        SysUser u=users.selectById(id); if (u==null) throw BizException.notFound();
        AdminUser before=view(id);
        String reason=reason(suppliedReason,"注册审核通过");
        if (!"APPROVE".equals(action) && (suppliedReason==null || suppliedReason.isBlank()))
            throw BizException.rule("reason","REASON_REQUIRED","请填写操作原因");
        switch (action) {
            case "APPROVE" -> {
                state(u,SysUser.PENDING); departments.requireEnabled(deptId);
                jdbc.update("UPDATE sys_user SET status='ACTIVE',dept_id=?,reviewed_by=?,reviewed_at=now(),review_note=? WHERE id=?",deptId,op.id(),reason,id);
                grantRole(id,Perms.ROLE_EMPLOYEE,op.id());
                notifications.registrationApproved(users.selectById(id),departments.name(deptId));
            }
            case "REJECT" -> {
                state(u,SysUser.PENDING);
                jdbc.update("UPDATE sys_user SET status='REJECTED',reviewed_by=?,reviewed_at=now(),review_note=? WHERE id=?",op.id(),reason,id);
            }
            case "DISABLE" -> {
                state(u,SysUser.ACTIVE); protectLastAdmin(id);
                jdbc.update("UPDATE sys_user SET status='DISABLED' WHERE id=?",id);
            }
            case "ENABLE" -> {
                state(u,SysUser.DISABLED); departments.requireEnabled(u.getDeptId());
                jdbc.update("UPDATE sys_user SET status='ACTIVE' WHERE id=?",id);
            }
            case "DEPT" -> {
                if (!List.of(SysUser.ACTIVE,SysUser.DISABLED).contains(u.getStatus())) throw BizException.stateChanged();
                departments.requireEnabled(deptId); jdbc.update("UPDATE sys_user SET dept_id=? WHERE id=?",deptId,id);
            }
            case "GRANT_ROLE", "REVOKE_ROLE", "PRIMARY" -> {
                Long roleId=roleId(roleCode);
                if ("GRANT_ROLE".equals(action)) {
                    state(u,SysUser.ACTIVE);
                    if (Perms.ROLE_DEPT_HEAD.equals(roleCode) && !isHead(id))
                        throw BizException.rule("roleCode","ROLE_HEAD_MANAGED","请在部门管理中设置负责人");
                    grantRole(id,roleCode,op.id());
                } else {
                    if (!hasRole(id,roleCode)) throw BizException.rule("roleCode","ROLE_NOT_GRANTED","该用户未持有此角色");
                    if ("REVOKE_ROLE".equals(action)) {
                        if (Perms.ROLE_DEPT_HEAD.equals(roleCode) && isHead(id))
                            throw BizException.rule("roleCode","ROLE_HEAD_MANAGED","请先调整该用户负责的部门");
                        if (Perms.ROLE_SYS_ADMIN.equals(roleCode)) protectLastAdmin(id);
                        jdbc.update("DELETE FROM user_role WHERE user_id=? AND role_id=?",id,roleId);
                    } else {
                        state(u,SysUser.ACTIVE);
                        if (Perms.ROLE_SYS_ADMIN.equals(roleCode)) throw BizException.rule("roleCode","ROLE_INVALID","系统管理员不能设为审批主办人");
                        List<Long> old=jdbc.queryForList("SELECT user_id FROM user_role WHERE role_id=? AND is_primary_handler",Long.class,roleId);
                        jdbc.update("UPDATE user_role SET is_primary_handler=false WHERE role_id=? AND is_primary_handler",roleId);
                        jdbc.update("UPDATE user_role SET is_primary_handler=true WHERE user_id=? AND role_id=?",id,roleId);
                        for (Long previous:old) if (!previous.equals(id)) {
                            support.invalidate(previous,false);
                            audit.write("USER_PRIMARY_REPLACED","USER",previous.toString(),Map.of("roleCode",roleCode,"primaryHandler",true),Map.of("roleCode",roleCode,"primaryHandler",false),reason);
                        }
                    }
                }
            }
            case "UNLOCK" -> jdbc.update("UPDATE sys_user SET failed_login_count=0,first_failed_at=NULL,locked_until=NULL WHERE id=?",id);
            default -> throw new IllegalArgumentException("未知用户管理动作");
        }
        support.invalidate(id,"DISABLE".equals(action));
        AdminUser after=view(id); audit.write("USER_"+action,"USER",id.toString(),before,after,reason);
        return after;
    }

    @Transactional
    public Map<String,String> resetPassword(Long id,String suppliedReason) {
        require(Perms.ADMIN_USER); support.lock();
        AdminUser target=view(id);
        if (suppliedReason==null || suppliedReason.isBlank()) throw BizException.rule("reason","REASON_REQUIRED","请填写操作原因");
        byte[] bytes=new byte[18]; RANDOM.nextBytes(bytes);
        String temp="Aa1!"+Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("UPDATE sys_user SET password_hash=?,failed_login_count=0,first_failed_at=NULL,locked_until=NULL WHERE id=?",passwords.encode(temp),id);
        support.invalidate(id,true);
        audit.write("USER_RESET_PASSWORD","USER",id.toString(),Map.of("username",target.username()),Map.of("passwordReset",true),reason(suppliedReason,"重置密码"));
        return Map.of("tempPassword",temp);
    }

    Long roleId(String code) {
        List<Long> ids=jdbc.queryForList("SELECT id FROM role WHERE code=?",Long.class,code);
        if (ids.isEmpty()) throw BizException.rule("roleCode","ROLE_INVALID","角色不存在");
        return ids.get(0);
    }
    void grantRole(Long uid,String code,Long operator) {
        jdbc.update("INSERT INTO user_role(user_id,role_id,granted_by) VALUES(?,?,?) ON CONFLICT(user_id,role_id) DO NOTHING",uid,roleId(code),operator);
    }
    boolean hasRole(Long uid,String code) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_role ur JOIN role r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code=?)",Boolean.class,uid,code));
    }
    boolean isHead(Long uid) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM department WHERE head_user_id=? AND deleted_at IS NULL)",Boolean.class,uid));
    }
    void protectLastAdmin(Long uid) {
        if (!hasRole(uid,Perms.ROLE_SYS_ADMIN)) return;
        Long count=jdbc.queryForObject("SELECT count(*) FROM sys_user u JOIN user_role ur ON ur.user_id=u.id JOIN role r ON r.id=ur.role_id WHERE r.code='SYS_ADMIN' AND u.status='ACTIVE' AND u.id<>?",Long.class,uid);
        if (count==0) throw BizException.rule("userId","LAST_ADMIN","至少保留一位启用的系统管理员");
    }
    private void state(SysUser u,String expected) { if (!expected.equals(u.getStatus())) throw BizException.stateChanged(); }
}

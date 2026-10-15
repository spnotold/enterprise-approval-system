package edu.zju.eas.service.admin;

import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.model.org.Department;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.DepartmentMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import static edu.zju.eas.service.admin.AdminSupport.*;

@Service
@RequiredArgsConstructor
public class DepartmentAdminService {
    private final JdbcTemplate jdbc;
    private final DepartmentMapper mapper;
    private final DepartmentService departments;
    private final SysUserMapper users;
    private final UserAdminService userAdmin;
    private final AdminSupport support;
    private final AuditService audit;

    public List<AdminDept> list() { require(Perms.ADMIN_DEPT); return jdbc.query("""
            SELECT d.*,u.real_name head_name,(SELECT count(*) FROM sys_user x WHERE x.dept_id=d.id) user_count
            FROM department d LEFT JOIN sys_user u ON u.id=d.head_user_id WHERE d.deleted_at IS NULL ORDER BY d.sort_order,d.id
            """,(r,n)->new AdminDept(r.getLong("id"),r.getString("code"),r.getString("name"),id(r,"head_user_id"),r.getString("head_name"),r.getLong("user_count"),r.getInt("sort_order"),time(r,"created_at"))); }
    private AdminDept view(Long id) { return list().stream().filter(d->d.id().equals(id)).findFirst().orElseThrow(BizException::notFound); }

    @Transactional
    public AdminDept save(Long id,DepartmentSave req) {
        require(Perms.ADMIN_DEPT); support.lock();
        AdminDept before=id==null?null:view(id);
        if (id==null) {
            if (req.code()==null || req.code().isBlank()) throw BizException.rule("code","DEPT_CODE_INVALID","请填写部门编码");
            Department d=new Department(); d.setCode(req.code());d.setName(req.name().trim()); d.setSortOrder(req.sortOrder()==null?0:req.sortOrder());
            mapper.insert(d); id=d.getId();
        } else jdbc.update("UPDATE department SET name=?,sort_order=? WHERE id=?",req.name().trim(),req.sortOrder()==null?before.sortOrder():req.sortOrder(),id);
        AdminDept after=view(id);
        audit.write(before==null?"DEPARTMENT_CREATE":"DEPARTMENT_UPDATE","DEPARTMENT",id.toString(),before,after,reason(req.reason(),before==null?"新建部门":"修改部门资料"));
        return after;
    }

    @Transactional
    public void remove(Long id,String reason) {
        reason=requiredReason(reason);
        require(Perms.ADMIN_DEPT); support.lock(); AdminDept before=view(id);
        boolean referenced=Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM sys_user WHERE dept_id=? OR requested_dept_id=?)
                OR EXISTS(SELECT 1 FROM application WHERE dept_id=?)
                OR EXISTS(SELECT 1 FROM process_template_dept WHERE dept_id=?)
                OR EXISTS(SELECT 1 FROM data_scope_grant WHERE dept_id=?)
            """,Boolean.class,id,id,id,id,id));
        if (referenced) throw BizException.rule("id","DEPT_REFERENCED","部门仍被用户、申请、模板或授权引用，不能删除");
        jdbc.update("UPDATE department SET deleted_at=now(),head_user_id=NULL WHERE id=?",id);
        clearHeadRole(before.headUserId());
        audit.write("DEPARTMENT_DELETE","DEPARTMENT",id.toString(),before,null,reason);
    }

    @Transactional
    public AdminDept setHead(Long id,SetHead req) {
        String reason=requiredReason(req.reason());
        var op=require(Perms.ADMIN_DEPT); support.lock(); departments.requireEnabled(id); AdminDept before=view(id);
        Long next=req.userId();
        if (next!=null) {
            SysUser u=users.selectById(next);
            if (u==null || !SysUser.ACTIVE.equals(u.getStatus())) throw BizException.rule("userId","HEAD_INVALID","负责人必须是已启用用户");
        }
        jdbc.update("UPDATE department SET head_user_id=? WHERE id=?",next,id);
        clearHeadRole(before.headUserId());
        if (next!=null) { userAdmin.grantRole(next,Perms.ROLE_DEPT_HEAD,op.id());support.invalidate(next,false); }
        AdminDept after=view(id);
        audit.write("DEPARTMENT_SET_HEAD","DEPARTMENT",id.toString(),before,after,reason);
        return after;
    }
    private void clearHeadRole(Long uid) {
        if (uid==null) return;
        if (!userAdmin.isHead(uid)) jdbc.update("DELETE FROM user_role WHERE user_id=? AND role_id=?",uid,userAdmin.roleId(Perms.ROLE_DEPT_HEAD));
        support.invalidate(uid,false);
    }
}

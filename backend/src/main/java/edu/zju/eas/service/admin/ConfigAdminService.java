package edu.zju.eas.service.admin;

import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.model.app.ExpenseType;
import edu.zju.eas.repository.ExpenseTypeMapper;
import edu.zju.eas.repository.FlowQueryMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.List;
import static edu.zju.eas.service.admin.AdminSupport.*;

@Service
@RequiredArgsConstructor
public class ConfigAdminService {
    private final JdbcTemplate jdbc;
    private final ExpenseTypeMapper types;
    private final SysConfigService config;
    private final FlowQueryMapper flow;
    private final AdminSupport support;
    private final AuditService audit;
    public List<ExpenseTypeView> expenseTypes() {
        require(Perms.ADMIN_CONFIG);return jdbc.query("SELECT t.*,EXISTS(SELECT 1 FROM expense_item i WHERE i.expense_type_id=t.id) referenced FROM expense_type t ORDER BY t.sort_order,t.id",
                (r,n)->new ExpenseTypeView(r.getLong("id"),r.getString("code"),r.getString("name"),r.getBoolean("enabled"),r.getInt("sort_order"),r.getBoolean("referenced")));
    }
    private ExpenseTypeView type(Long id) {return expenseTypes().stream().filter(t->t.id().equals(id)).findFirst().orElseThrow(BizException::notFound);}
    @Transactional
    public ExpenseTypeView saveType(Long id,ExpenseTypeSave req) {
        require(Perms.ADMIN_CONFIG);support.lock();ExpenseTypeView before=id==null?null:type(id);
        if (id==null) {
            if (req.code()==null || req.code().isBlank()) throw BizException.rule("code","EXPENSE_TYPE_INVALID","请填写费用类型编码");
            ExpenseType t=new ExpenseType();t.setCode(req.code());t.setName(req.name().trim());t.setEnabled(true);t.setSortOrder(req.sortOrder()==null?0:req.sortOrder());types.insert(t);id=t.getId();
        } else {
            if (req.enabled()==null) throw BizException.rule("enabled","EXPENSE_TYPE_INVALID","请指定启用状态");
            jdbc.update("UPDATE expense_type SET name=?,enabled=?,sort_order=? WHERE id=?",req.name().trim(),req.enabled(),req.sortOrder()==null?before.sortOrder():req.sortOrder(),id);
        }
        ExpenseTypeView after=type(id);audit.write(before==null?"EXPENSE_TYPE_CREATE":"EXPENSE_TYPE_UPDATE","EXPENSE_TYPE",id.toString(),before,after,before==null?"新增费用类型":"调整费用类型");return after;
    }
    @Transactional
    public void removeType(Long id) {
        require(Perms.ADMIN_CONFIG);support.lock();ExpenseTypeView before=type(id);
        if (before.referenced()) throw BizException.rule("id","EXPENSE_TYPE_REFERENCED","费用类型已被引用，只能停用");
        jdbc.update("DELETE FROM expense_type WHERE id=?",id);
        audit.write("EXPENSE_TYPE_DELETE","EXPENSE_TYPE",id.toString(),before,null,"删除未被引用的费用类型");
    }
    public List<ConfigItem> list() {
        require(Perms.ADMIN_CONFIG);return jdbc.query("SELECT * FROM sys_config ORDER BY config_key",(r,n)->new ConfigItem(r.getString("config_key"),r.getString("config_value"),r.getString("description"),time(r,"updated_at")));
    }
    @Transactional
    public ConfigItem update(String key,ConfigSave req) {
        var op=require(Perms.ADMIN_CONFIG);support.lock();ConfigItem before=list().stream().filter(c->c.key().equals(key)).findFirst().orElseThrow(BizException::notFound);
        String reason=requiredReason(req.reason());
        String value=req.value().trim();boolean valid;
        switch(key) {
            case SysConfigService.MAIL_ENABLED -> valid=List.of("true","false").contains(value);
            case SysConfigService.MAX_FILES_PER_APP, SysConfigService.MAX_TOTAL_MB_PER_APP, SysConfigService.TASK_OVERDUE_HOURS -> {
                try { int number=Integer.parseInt(value);valid=number>0 && number<=100000; } catch(NumberFormatException e) {valid=false;}
            }
            case SysConfigService.FALLBACK_APPROVER -> {
                Long uid=null;
                if(value.startsWith("DEPT:")) uid=flow.headOfCode(value.substring(5));
                else if(value.startsWith("USER:")) { try {uid=Long.valueOf(value.substring(5));} catch(NumberFormatException ignored) {} }
                valid=uid!=null && Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT EXISTS(SELECT 1 FROM sys_user u JOIN user_role ur ON ur.user_id=u.id
                        JOIN role_permission rp ON rp.role_id=ur.role_id JOIN permission p ON p.id=rp.permission_id
                        WHERE u.id=? AND u.status='ACTIVE' AND p.code='TASK_HANDLE')
                        """,Boolean.class,uid)) && !flow.isSysAdmin(uid);
            }
            default -> valid=false;
        }
        if(!valid) throw BizException.rule("value","CONFIG_INVALID","配置值不合法或兜底审批人不可用");
        jdbc.update("UPDATE sys_config SET config_value=?,updated_by=? WHERE config_key=?",value,op.id(),key);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){config.evict();}});
        ConfigItem after=list().stream().filter(c->c.key().equals(key)).findFirst().orElseThrow();
        audit.write("CONFIG_UPDATE","SYS_CONFIG",key,before,after,reason);return after;
    }
}

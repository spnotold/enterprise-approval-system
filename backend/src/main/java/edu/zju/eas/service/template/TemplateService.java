package edu.zju.eas.service.template;

import edu.zju.eas.common.Jsons;
import edu.zju.eas.dto.template.TemplateDtos.*;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.ProcessTemplateMapper;
import edu.zju.eas.repository.ProcessTemplateVersionMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.response.FieldError;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.AuditService;
import edu.zju.eas.service.DepartmentService;
import edu.zju.eas.service.admin.AdminSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import static edu.zju.eas.service.admin.AdminSupport.*;

/** 发布只切换版本指针；已发布配置及任何申请、流程快照都不被改写。 */
@Service
@RequiredArgsConstructor
public class TemplateService {
    private final JdbcTemplate jdbc;
    private final ProcessTemplateMapper templates;
    private final ProcessTemplateVersionMapper versions;
    private final DepartmentService departments;
    private final TemplatePublishValidator validator;
    private final AdminSupport support;
    private final AuditService audit;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Option> available() {
        var u = require(Perms.APP_CREATE);
        return jdbc.query("""
                SELECT t.* FROM process_template t JOIN process_template_version v ON v.id=t.current_version_id
                WHERE t.enabled AND v.template_id=t.id AND v.status='PUBLISHED'
                AND (NOT EXISTS(SELECT 1 FROM process_template_dept d WHERE d.template_id=t.id)
                     OR EXISTS(SELECT 1 FROM process_template_dept d WHERE d.template_id=t.id AND d.dept_id=?))
                ORDER BY t.sort_order,t.id
                """, (r,n)->new Option(r.getLong("id"),r.getString("code"),r.getString("name"),
                r.getString("description"),r.getString("category"),r.getString("biz_type")),u.deptId());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail current(Long id) {
        var u=require(Perms.APP_CREATE);
        ProcessTemplate t=template(id);
        if (!Boolean.TRUE.equals(t.getEnabled()) || t.getCurrentVersionId()==null
                || !appliesTo(id,u.deptId())) throw BizException.notFound();
        ProcessTemplateVersion v=storedVersion(t.getCurrentVersionId());
        if(v==null || !id.equals(v.getTemplateId()) || !ProcessTemplateVersion.PUBLISHED.equals(v.getStatus())) throw BizException.notFound();
        return new Detail(id,t.getCode(),t.getName(),t.getDescription(),t.getCategory(),t.getBizType(),v.getId(),v.getVersionNo(),v.getFormSchema());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<AdminItem> list() {
        require(Perms.ADMIN_TEMPLATE);
        return jdbc.queryForList("SELECT id FROM process_template ORDER BY sort_order,id",Long.class).stream().map(this::item).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminDetail get(Long id) { require(Perms.ADMIN_TEMPLATE); return detail(id); }

    @Transactional
    public AdminDetail create(Create req) {
        var u=require(Perms.ADMIN_TEMPLATE); support.lock();
        validateDepartments(req.deptIds());
        ProcessTemplate t=new ProcessTemplate();t.setCode(req.code());t.setName(req.name().trim());t.setDescription(req.description());
        t.setCategory(ProcessTemplate.CUSTOM);t.setBizType("CUSTOM");t.setEnabled(false);t.setSortOrder(0);t.setCreatedBy(u.id());templates.insert(t);
        replaceDepartments(t.getId(),req.deptIds());
        insertDraft(t,null,u.id());
        AdminDetail after=detail(t.getId());
        audit.write("TEMPLATE_CREATE","TEMPLATE",t.getId().toString(),null,after,"新建自定义模板");return after;
    }

    @Transactional
    public AdminDetail update(Long id,Update req) {
        require(Perms.ADMIN_TEMPLATE); lock(id);AdminDetail before=detail(id);
        validateDepartments(req.deptIds());
        jdbc.update("UPDATE process_template SET name=?,description=? WHERE id=?",req.name().trim(),req.description(),id);
        replaceDepartments(id,req.deptIds());
        AdminDetail after=detail(id);
        audit.write("TEMPLATE_UPDATE","TEMPLATE",id.toString(),before,after,"修改模板基本资料及适用部门");return after;
    }

    @Transactional
    public AdminDetail setEnabled(Long id,boolean enabled,String suppliedReason) {
        require(Perms.ADMIN_TEMPLATE); lock(id);String reason=requiredReason(suppliedReason);AdminDetail before=detail(id);
        if(enabled) {
            ProcessTemplate t=template(id);
            ProcessTemplateVersion v=t.getCurrentVersionId()==null?null:storedVersion(t.getCurrentVersionId());
            if(v==null || !id.equals(v.getTemplateId()) || !ProcessTemplateVersion.PUBLISHED.equals(v.getStatus()))
                throw BizException.rule("id","TPL_NOT_PUBLISHED","请先发布有效模板版本");
            throwIssues(validator.validate(t,v,deptIds(id)));
        }
        jdbc.update("UPDATE process_template SET enabled=? WHERE id=?",enabled,id);
        AdminDetail after=detail(id);
        audit.write(enabled?"TEMPLATE_ENABLE":"TEMPLATE_DISABLE","TEMPLATE",id.toString(),before,after,reason);return after;
    }

    @Transactional
    public VersionDetail createDraft(Long id) {
        var u=require(Perms.ADMIN_TEMPLATE);lock(id);ProcessTemplate t=template(id);
        Long draft=draftId(id);
        if(draft!=null) return version(draft);
        ProcessTemplateVersion source=t.getCurrentVersionId()==null?null:storedVersion(t.getCurrentVersionId());
        ProcessTemplateVersion v=insertDraft(t,source,u.id());VersionDetail after=version(v.getId());
        touch(id);audit.write("TEMPLATE_DRAFT_CREATE","TEMPLATE",id.toString(),null,after,"复制发布版本创建草稿");return after;
    }

    @Transactional
    public VersionDetail saveDraft(Long id,Draft req) {
        require(Perms.ADMIN_TEMPLATE);lock(id);Long draft=requireDraft(id);VersionDetail before=version(draft);
        ProcessTemplate t=template(id);
        if(ProcessTemplate.BUILTIN.equals(t.getCategory()) && (!Objects.equals(t.getBizType(),req.formSchema().getBuiltin())
                || req.formSchema().getFields()==null || !req.formSchema().getFields().isEmpty()))
            throw BizException.rule("formSchema","TPL_FIELD_INVALID","内置模板表单固定，只能修改节点配置");
        // 草稿允许暂存不完整配置；发布时统一返回全部校验问题。
        if(jdbc.update("UPDATE process_template_version SET form_schema=?::jsonb,node_config=?::jsonb WHERE id=? AND status='DRAFT'",
                Jsons.write(req.formSchema()),Jsons.write(req.nodeConfig()),draft)!=1) throw BizException.stateChanged();
        touch(id);VersionDetail after=version(draft);
        audit.write("TEMPLATE_DRAFT_SAVE","TEMPLATE",id.toString(),before,after,"保存模板草稿");return after;
    }

    @Transactional
    public void discardDraft(Long id) {
        require(Perms.ADMIN_TEMPLATE);lock(id);Long draft=requireDraft(id);VersionDetail before=version(draft);
        if(jdbc.update("DELETE FROM process_template_version WHERE id=? AND status='DRAFT'",draft)!=1) throw BizException.stateChanged();
        touch(id);audit.write("TEMPLATE_DRAFT_DISCARD","TEMPLATE",id.toString(),before,null,"丢弃模板草稿");
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<ValidationIssue> validate(Long id) {
        require(Perms.ADMIN_TEMPLATE);ProcessTemplate t=template(id);Long draft=draftId(id);
        if(draft==null) return List.of(new ValidationIssue("TPL_BASIC","draft","没有可发布的草稿版本"));
        return validator.validate(t,storedVersion(draft),deptIds(id));
    }

    @Transactional
    public AdminDetail publish(Long id,String changeNote) {
        var u=require(Perms.ADMIN_TEMPLATE);lock(id);
        if(changeNote==null || changeNote.isBlank() || changeNote.trim().length()>500)
            throw BizException.rule("changeNote","REASON_REQUIRED","发布必须填写1至500字变更说明");
        ProcessTemplate t=template(id);Long draft=requireDraft(id);ProcessTemplateVersion v=storedVersion(draft);
        throwIssues(validator.validate(t,v,deptIds(id)));AdminDetail before=detail(id);
        // 先归档旧版本，满足每个模板至多一个发布版本的部分唯一索引。
        jdbc.update("UPDATE process_template_version SET status='ARCHIVED' WHERE template_id=? AND status='PUBLISHED'",id);
        if(jdbc.update("UPDATE process_template_version SET status='PUBLISHED',change_note=?,published_by=?,published_at=now() WHERE id=? AND status='DRAFT'",
                changeNote.trim(),u.id(),draft)!=1) throw BizException.stateChanged();
        jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?",draft,id);
        AdminDetail after=detail(id);audit.write("TEMPLATE_PUBLISH","TEMPLATE",id.toString(),before,after,changeNote.trim());return after;
    }

    private void lock(Long id) {
        support.lock();
        if(jdbc.queryForList("SELECT id FROM process_template WHERE id=? FOR UPDATE",Long.class,id).isEmpty()) throw BizException.notFound();
    }
    private ProcessTemplate template(Long id) {
        return jdbc.query("SELECT * FROM process_template WHERE id=?",org.springframework.jdbc.core.BeanPropertyRowMapper.newInstance(ProcessTemplate.class),id)
                .stream().findFirst().orElseThrow(BizException::notFound);
    }
    private ProcessTemplateVersion storedVersion(Long id) {
        return jdbc.query("SELECT * FROM process_template_version WHERE id=?",(r,n)->{
            ProcessTemplateVersion v=new ProcessTemplateVersion();v.setId(r.getLong("id"));v.setTemplateId(r.getLong("template_id"));
            v.setVersionNo(r.getInt("version_no"));v.setStatus(r.getString("status"));
            v.setFormSchema(Jsons.read(r.getString("form_schema"),FormSchema.class));v.setNodeConfig(Jsons.read(r.getString("node_config"),NodeConfig.class));
            return v;
        },id).stream().findFirst().orElse(null);
    }
    private List<Long> deptIds(Long id) {return jdbc.queryForList("SELECT dept_id FROM process_template_dept WHERE template_id=? ORDER BY dept_id",Long.class,id);}
    private boolean appliesTo(Long id,Long deptId) {
        List<Long> ids=deptIds(id);return ids.isEmpty() || ids.contains(deptId);
    }
    private void validateDepartments(List<Long> ids) {
        if(ids==null || ids.size()>1000 || new HashSet<>(ids).size()!=ids.size()) throw BizException.rule("deptIds","TPL_BASIC","适用部门不得重复或超过1000个");
        for(Long id:ids) departments.requireEnabled(id);
    }
    private void replaceDepartments(Long id,List<Long> ids) {
        jdbc.update("DELETE FROM process_template_dept WHERE template_id=?",id);
        for(Long dept:ids) jdbc.update("INSERT INTO process_template_dept(template_id,dept_id) VALUES(?,?)",id,dept);
    }
    private Long draftId(Long id) {return jdbc.queryForList("SELECT id FROM process_template_version WHERE template_id=? AND status='DRAFT'",Long.class,id).stream().findFirst().orElse(null);}
    private Long requireDraft(Long id) {
        Long draft=draftId(id);if(draft==null) throw BizException.rule("draft","TPL_BASIC","请先创建模板草稿");return draft;
    }
    private ProcessTemplateVersion insertDraft(ProcessTemplate t,ProcessTemplateVersion source,Long uid) {
        ProcessTemplateVersion v=new ProcessTemplateVersion();v.setTemplateId(t.getId());
        v.setVersionNo(jdbc.queryForObject("SELECT COALESCE(max(version_no),0)+1 FROM process_template_version WHERE template_id=?",Integer.class,t.getId()));
        v.setStatus(ProcessTemplateVersion.DRAFT);v.setCreatedBy(uid);
        FormSchema schema=new FormSchema();if(ProcessTemplate.BUILTIN.equals(t.getCategory())) schema.setBuiltin(t.getBizType());
        v.setFormSchema(source==null?schema:Jsons.read(Jsons.write(source.getFormSchema()),FormSchema.class));
        v.setNodeConfig(source==null?new NodeConfig():Jsons.read(Jsons.write(source.getNodeConfig()),NodeConfig.class));
        versions.insert(v);return v;
    }
    private void touch(Long id) {jdbc.update("UPDATE process_template SET updated_at=now() WHERE id=?",id);}
    private VersionDetail version(Long id) {
        return jdbc.query("""
                SELECT v.*,u.real_name publisher FROM process_template_version v LEFT JOIN sys_user u ON u.id=v.published_by WHERE v.id=?
                """,(r,n)->new VersionDetail(r.getLong("id"),r.getInt("version_no"),r.getString("status"),r.getString("change_note"),
                time(r,"created_at"),time(r,"published_at"),r.getString("publisher"),Jsons.read(r.getString("form_schema"),FormSchema.class),
                Jsons.read(r.getString("node_config"),NodeConfig.class)),id).stream().findFirst().orElseThrow(BizException::notFound);
    }
    private AdminItem item(Long id) {
        ProcessTemplate t=template(id);List<Long> ids=deptIds(id);
        List<String> names=ids.stream().map(departments::name).toList();
        Integer no=t.getCurrentVersionId()==null?null:storedVersion(t.getCurrentVersionId()).getVersionNo();
        long usage=jdbc.queryForObject("SELECT count(*) FROM application WHERE template_id=? AND deleted_at IS NULL",Long.class,id);
        return new AdminItem(id,t.getCode(),t.getName(),t.getDescription(),t.getCategory(),t.getBizType(),Boolean.TRUE.equals(t.getEnabled()),ids,names,no,draftId(id)!=null,usage,t.getUpdatedAt());
    }
    private AdminDetail detail(Long id) {
        AdminItem a=item(id);ProcessTemplate t=template(id);Long draft=draftId(id);
        List<VersionBrief> briefs=jdbc.query("""
                SELECT v.*,u.real_name publisher FROM process_template_version v LEFT JOIN sys_user u ON u.id=v.published_by WHERE v.template_id=? ORDER BY v.version_no DESC
                """,(r,n)->new VersionBrief(r.getLong("id"),r.getInt("version_no"),r.getString("status"),r.getString("change_note"),time(r,"created_at"),time(r,"published_at"),r.getString("publisher")),id);
        return new AdminDetail(a.id(),a.code(),a.name(),a.description(),a.category(),a.bizType(),a.enabled(),a.deptIds(),a.deptNames(),a.currentVersionNo(),
                a.hasDraft(),a.usageCount(),a.updatedAt(),briefs,t.getCurrentVersionId()==null?null:version(t.getCurrentVersionId()),draft==null?null:version(draft));
    }
    private void throwIssues(List<ValidationIssue> issues) {
        if(!issues.isEmpty()) throw new BizException(ErrorCode.BIZ_RULE,null,issues.stream().map(i->new FieldError(i.path(),i.code(),i.message())).toList());
    }
}

package edu.zju.eas.service.app;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.dto.app.*;
import edu.zju.eas.dto.app.BusinessRequests.*;
import edu.zju.eas.dto.flow.PathPreview;
import edu.zju.eas.model.app.*;
import edu.zju.eas.model.flow.*;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.*;
import edu.zju.eas.response.*;
import edu.zju.eas.security.*;
import edu.zju.eas.service.*;
import edu.zju.eas.service.file.FileService;
import edu.zju.eas.service.flow.FlowEngine;
import edu.zju.eas.service.flow.UserDirectory;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static edu.zju.eas.service.app.BusinessDataService.map;

@Service
@RequiredArgsConstructor
public class ApplicationService {
    private static final Set<String> TYPES=Set.of("PURCHASE","TRAVEL","EXPENSE","CUSTOM");
    private static final Set<String> STATUSES=Set.of("DRAFT","IN_APPROVAL","APPROVED","REJECTED","WITHDRAWN");
    private final ApplicationMapper applications;
    private final ProcessTemplateMapper templates;
    private final ProcessTemplateVersionMapper versions;
    private final ProcessTemplateDeptMapper templateDepartments;
    private final ApprovalTaskMapper tasks;
    private final FlowNodeInstanceMapper nodes;
    private final FlowInstanceMapper instances;
    private final ApprovalLogMapper logs;
    private final ExpenseInvoiceMapper invoices;
    private final BusinessDataService business;
    private final AccessPolicy access;
    private final AuditService audit;
    private final FileService files;
    private final FlowEngine engine;
    private final UserDirectory users;
    private final DepartmentService departments;
    private final SysConfigService config;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Transactional
    public Map<String,Object> create(String type,Object request,CurrentUser user) {
        requireCreate(user);Long templateId=request instanceof Custom r?r.templateId():null;
        ProcessTemplate template=templateId==null?templates.selectOne(Wrappers.<ProcessTemplate>lambdaQuery().eq(ProcessTemplate::getBizType,type).eq(ProcessTemplate::getCategory,"BUILTIN")):templates.selectById(templateId);
        requireTemplate(template,type,user);
        Application a=newDraft(type,template.getId(),user,null);applications.insert(a);
        Long amount=business.save(a,request,user);setDraftValues(a,title(request),amount);
        return saved(applications.selectById(a.getId()));
    }

    @Transactional
    public Map<String,Object> save(Long id,String type,Object request,CurrentUser user) {
        requireCreate(user);Application a=own(id,user);
        if(!type.equals(a.getType())||!"DRAFT".equals(a.getStatus()))throw BizException.stateChanged();
        Integer version=version(request);if(version==null)throw new BizException(ErrorCode.BAD_REQUEST,"保存草稿必须带 version");
        if(applications.saveDraftHeader(id,user.id(),version,title(request),a.getAmountCents())==0)throw new BizException(ErrorCode.DRAFT_MODIFIED);
        Long amount=business.save(a,request,user);setDraftValues(a,title(request),amount);
        return saved(applications.selectById(id));
    }

    @Transactional
    public void remove(Long id,CurrentUser user){Application a=own(id,user);if(applications.softDelete(id,user.id())==0)throw BizException.stateChanged();files.bind(a,Map.of(),user);}

    @Transactional
    public Map<String,Object> copy(Long id,CurrentUser user){
        requireCreate(user);Application source=own(id,user);
        if(!Set.of("REJECTED","WITHDRAWN").contains(source.getStatus()))throw BizException.stateChanged();
        ProcessTemplate template=templates.selectById(source.getTemplateId());requireTemplate(template,source.getType(),user);
        Application target=newDraft(source.getType(),source.getTemplateId(),user,id);applications.insert(target);
        Map<Long,Long> ids=files.copyAll(id,target,user);ObjectNode body=Jsons.tree(business.request(source)).deepCopy();
        body.put("title",source.getTitle());body.remove("version");
        remapArray(body,"attachmentIds",ids);remapArray(body,"singleSourceAttachmentIds",ids);
        if(body.path("quotes").isArray())for(JsonNode quote:body.path("quotes"))remapArray((ObjectNode)quote,"attachmentIds",ids);
        if(body.path("items").isArray())for(JsonNode item:body.path("items"))if(item.path("invoices").isArray())for(JsonNode invoice:item.path("invoices"))((ObjectNode)invoice).put("attachmentId",ids.get(invoice.path("attachmentId").longValue()));
        if("TRAVEL".equals(source.getType())){
            var valid=Jsons.MAPPER.createArrayNode();Set<Long> seen=new HashSet<>();
            for(JsonNode c:body.path("companions")){
                if(c.path("userId").isNull()||!c.has("userId")){valid.add(c);continue;}
                Long uid=c.path("userId").longValue();var companion=users.get(uid);
                if(companion!=null&&"ACTIVE".equals(companion.getStatus())&&!uid.equals(user.id())&&seen.add(uid))valid.add(c);
            }
            body.set("companions",valid);
        }
        if("CUSTOM".equals(source.getType())){
            ProcessTemplateVersion old=versions.selectById(body.path("templateVersionId").longValue());ProcessTemplateVersion current=versions.selectById(template.getCurrentVersionId());
            ObjectNode carried=Jsons.MAPPER.createObjectNode();
            for(FormField f:current.getFormSchema().getFields())if(old.getFormSchema().getFields().stream().anyMatch(o->o.getKey().equals(f.getKey())&&o.getType().equals(f.getType()))&&body.path("formValues").has(f.getKey())){
                carried.set(f.getKey(),body.path("formValues").get(f.getKey()));if("ATTACHMENT".equals(f.getType()))remapArray(carried,f.getKey(),ids);
            }
            body.set("formValues",carried);body.put("templateVersionId",current.getId());
        }
        Object request=switch(source.getType()){case "PURCHASE"->Jsons.convert(body,Purchase.class);case "TRAVEL"->Jsons.convert(body,Travel.class);case "EXPENSE"->Jsons.convert(body,Expense.class);default->Jsons.convert(body,Custom.class);};
        if(request instanceof Custom custom)request=business.sanitizeCopy(target,custom);
        Long amount=business.save(target,request,user);setDraftValues(target,source.getTitle(),amount);return saved(applications.selectById(target.getId()));
    }

    public PageResponse<ApplicationSummary> list(CurrentUser user,String scope,String type,String status,LocalDate from,LocalDate to,String keyword,Long deptId,int page,int size){
        checkPage(page,size);if(!Set.of("mine","dept","granted").contains(scope))throw new BizException(ErrorCode.BAD_REQUEST,"查询范围不正确");
        if(type!=null&&!TYPES.contains(type)||status!=null&&!STATUSES.contains(status)||from!=null&&to!=null&&from.isAfter(to))throw new BizException(ErrorCode.BAD_REQUEST,"筛选条件不正确");
        if(keyword!=null&&keyword.length()>100)throw new BizException(ErrorCode.BAD_REQUEST,"关键词过长");
        Set<Long> visible=new HashSet<>();boolean all=false;
        if("dept".equals(scope)){
            if(!user.has(Perms.APP_READ_DEPT))throw BizException.forbidden();visible.addAll(user.headDeptIds());
            if(deptId!=null){if(!visible.contains(deptId))throw BizException.forbidden();visible.retainAll(Set.of(deptId));}
        }
        if("granted".equals(scope)){
            String permission=user.isAdmin()?Perms.GRANT_BIZ_CONTENT_READ:Perms.GRANT_APP_READ;
            for(GrantScope g:user.grants())if(g.permissionCode().equals(permission)&&g.activeAt(clock.instant())){if("ALL".equals(g.scopeType()))all=true;else visible.add(g.deptId());}
            if(!all&&visible.isEmpty())throw BizException.forbidden();
        }
        var query=new ListQuery(scope,user.id(),visible,all,type,status,from,to,keyword==null||keyword.isBlank()?null:keyword.trim());
        return PageResponse.of(applications.pageList(new Page<>(page,size),query),this::summary);
    }

    public Map<String,Object> detail(Long id,CurrentUser user){
        Application a=applications.selectById(id);boolean full=access.canViewApplication(user,a);
        if(!full&&!access.canViewAsLinked(user,a))throw BizException.notFound();
        if(full&&user.isAdmin()&&!user.id().equals(a.getApplicantId()))audit.logBizAccess(user,a,"DETAIL");
        var template=templates.selectById(a.getTemplateId());var version=a.getTemplateVersionId()==null?null:versions.selectById(a.getTemplateVersionId());
        boolean canFiles=full&&access.canReadApplicationAttachments(user,a);ApprovalTask myTask=full?tasks.pendingOf(id,user.id()):null;List<String> actions=new ArrayList<>();
        if(full&&user.id().equals(a.getApplicantId())&&user.has(Perms.APP_CREATE)){
            if("DRAFT".equals(a.getStatus()))actions.addAll(List.of("EDIT","DELETE","SUBMIT"));
            if("IN_APPROVAL".equals(a.getStatus()))actions.addAll(List.of("WITHDRAW","URGE"));
            if(Set.of("REJECTED","WITHDRAWN").contains(a.getStatus()))actions.add("COPY");
        }
        if(myTask!=null&&!user.id().equals(a.getApplicantId())&&user.has(Perms.TASK_HANDLE)&&"IN_APPROVAL".equals(a.getStatus()))actions.addAll(List.of("APPROVE","REJECT"));
        Map<String,Object> out=map("id",a.getId(),"appNo",a.getAppNo(),"type",a.getType(),"title",a.getTitle(),"status",a.getStatus(),"version",a.getVersion(),"templateId",a.getTemplateId(),"templateName",template.getName(),"templateVersionNo",version==null?null:version.getVersionNo(),"applicant",users.brief(a.getApplicantId()),"deptId",a.getDeptId(),"deptName",departments.name(a.getDeptId()),"amountCents",a.getAmountCents(),"currentNodeSeq",a.getCurrentNodeSeq(),"submittedAt",a.getSubmittedAt(),"finishedAt",a.getFinishedAt(),"createdAt",a.getCreatedAt(),"updatedAt",a.getUpdatedAt(),"viewMode",full?"FULL":"LINKED","linked",full?null:business.linked(a),"canReadAttachments",canFiles,"allowedActions",actions,"myTaskId",myTask==null?null:myTask.getId());
        Application source=full&&a.getSourceApplicationId()!=null?applications.selectById(a.getSourceApplicationId()):null;
        out.put("source",source!=null&&access.canViewApplication(user,source)?link(source):null);
        out.put("urgeNextAllowedAt",user.id().equals(a.getApplicantId())&&"IN_APPROVAL".equals(a.getStatus())?engine.nextUrgeAllowedAt(id):null);
        out.put("followUps",full?applications.selectList(Wrappers.<Application>lambdaQuery().eq(Application::getSourceApplicationId,id).isNull(Application::getDeletedAt)).stream().filter(f->access.canViewApplication(user,f)).map(ApplicationService::link).toList():List.of());
        for(String type:TYPES)out.put(type.toLowerCase(Locale.ROOT),full&&a.getType().equals(type)?business.view(a,canFiles,revealDuplicates(user,a)):null);
        out.put("flow",flow(a,!full));out.put("logs",full?logRows(id):List.of());return out;
    }

    public List<Map<String,Object>> logs(Long id,CurrentUser u){Application a=applications.selectById(id);if(!access.canViewApplication(u,a))throw BizException.notFound();if(u.isAdmin()&&!u.id().equals(a.getApplicantId()))audit.logBizAccess(u,a,"LOGS");return logRows(id);}
    public PathPreview preview(Long id,CurrentUser u){Application a=own(id,u);if(!"DRAFT".equals(a.getStatus()))throw BizException.stateChanged();return engine.preview(a,u);}
    public List<Map<String,Object>> linkable(CurrentUser u){return applications.selectList(Wrappers.<Application>lambdaQuery().eq(Application::getApplicantId,u.id()).eq(Application::getStatus,"APPROVED").in(Application::getType,List.of("TRAVEL","PURCHASE")).isNull(Application::getDeletedAt).orderByDesc(Application::getFinishedAt)).stream().map(business::linked).toList();}
    public List<Map<String,Object>> invoiceDuplicates(Long id,CurrentUser u){Application a=applications.selectById(id);if(!access.canViewApplication(u,a)||!access.canReadApplicationAttachments(u,a))throw BizException.notFound();if(!"EXPENSE".equals(a.getType()))return List.of();if(u.isAdmin())audit.logBizAccess(u,a,"INVOICE_DUPLICATES");return invoices.selectList(Wrappers.<ExpenseInvoice>lambdaQuery().eq(ExpenseInvoice::getApplicationId,id)).stream().flatMap(iv->business.duplicates(iv,revealDuplicates(u,a)).stream()).toList();}

    public PageResponse<Map<String,Object>> taskList(CurrentUser user,boolean pending,String type,String keyword,int page,int size){
        checkPage(page,size);if(!user.has(Perms.TASK_HANDLE))throw BizException.forbidden();if(type!=null&&!TYPES.contains(type)||keyword!=null&&keyword.length()>100)throw new BizException(ErrorCode.BAD_REQUEST);
        String where=" FROM approval_task t JOIN application a ON a.id=t.application_id WHERE t.assignee_id=? AND a.deleted_at IS NULL AND "+(pending?"t.status='PENDING' AND a.status='IN_APPROVAL'":"t.status IN ('APPROVED','REJECTED','TRANSFERRED')");
        List<Object> params=new ArrayList<>();params.add(user.id());if(type!=null){where+=" AND a.type=?";params.add(type);}if(keyword!=null&&!keyword.isBlank()){where+=" AND strpos(lower(a.app_no || ' ' || coalesce(a.title,'')),lower(?))>0";params.add(keyword.trim());}
        Long total=jdbc.queryForObject("SELECT count(*)"+where,Long.class,params.toArray());List<Object> paged=new ArrayList<>(params);paged.add(size);paged.add((page-1)*size);
        var ids=jdbc.queryForList("SELECT t.id"+where+" ORDER BY "+(pending?"t.created_at":"t.acted_at")+" DESC,t.id DESC LIMIT ? OFFSET ?",Long.class,paged.toArray());
        List<Map<String,Object>> rows=new ArrayList<>();for(Long id:ids){var t=tasks.selectById(id);var a=applications.selectById(t.getApplicationId());var n=nodes.selectById(t.getNodeInstanceId());var template=templates.selectById(a.getTemplateId());
            int hours=n.getTimeoutHours()==null?config.getInt(SysConfigService.TASK_OVERDUE_HOURS,48):n.getTimeoutHours();
            rows.add(map("taskId",id,"applicationId",a.getId(),"appNo",a.getAppNo(),"type",a.getType(),"title",a.getTitle(),"templateName",template.getName(),"applicant",users.brief(a.getApplicantId()),"deptName",departments.name(a.getDeptId()),"amountCents",a.getAmountCents(),"nodeName",n.getName(),"status",t.getStatus(),"comment",t.getComment(),"appStatus",a.getStatus(),"appVersion",a.getVersion(),"submittedAt",a.getSubmittedAt(),"createdAt",t.getCreatedAt(),"actedAt",t.getActedAt(),"overdue",pending&&t.getCreatedAt().plusHours(hours).toInstant().isBefore(clock.instant())));
        }return PageResponse.of(rows,total,page,size);
    }

    public ApplicationSummary summary(Application a){var t=templates.selectById(a.getTemplateId());return new ApplicationSummary(a.getId(),a.getAppNo(),a.getType(),a.getTitle(),a.getStatus(),t.getName(),users.brief(a.getApplicantId()),departments.name(a.getDeptId()),a.getAmountCents(),engine.result(a).currentNode(),a.getSubmittedAt(),a.getFinishedAt(),a.getCreatedAt(),a.getUpdatedAt(),a.getVersion());}
    private Map<String,Object> flow(Application a,boolean restricted){
        FlowInstance instance=instances.selectOne(Wrappers.<FlowInstance>lambdaQuery().eq(FlowInstance::getApplicationId,a.getId()));if(instance==null)return null;
        List<Map<String,Object>> result=new ArrayList<>();for(var n:nodes.selectList(Wrappers.<FlowNodeInstance>lambdaQuery().eq(FlowNodeInstance::getApplicationId,a.getId()).orderByAsc(FlowNodeInstance::getSeq))){
            var assigned=tasks.selectList(Wrappers.<ApprovalTask>lambdaQuery().eq(ApprovalTask::getNodeInstanceId,n.getId()).orderByAsc(ApprovalTask::getId));
            result.add(map("seq",n.getSeq(),"nodeKey",n.getNodeKey(),"name",n.getName(),"status",n.getStatus(),"mode",n.getMode(),"effective",n.getEffective(),"conditionResult",n.getConditionResult(),"conditionText",conditionText(instance,n.getSeq()),"assignee",users.brief(n.getAssigneeId()),"candidates",n.getCandidateIds()==null?List.of():n.getCandidateIds().stream().map(users::brief).filter(Objects::nonNull).toList(),"requiredCount",n.getRequiredCount(),"approvedCount",n.getApprovedCount(),"resolveNote",n.getResolveNote(),"activatedAt",n.getActivatedAt(),"finishedAt",n.getFinishedAt(),"tasks",assigned.stream().map(t->map("id",t.getId(),"assignee",users.brief(t.getAssigneeId()),"status",t.getStatus(),"comment",restricted?null:t.getComment(),"createdAt",t.getCreatedAt(),"actedAt",t.getActedAt())).toList()));
            if(restricted){Map<String,Object> visible=result.get(result.size()-1);visible.put("conditionText",null);visible.put("resolveNote",null);}
        }return map("templateCode",templates.selectById(a.getTemplateId()).getCode(),"versionNo",instance.getVersionNo(),"nodes",result);
    }
    private String conditionText(FlowInstance instance,int seq){for(JsonNode n:instance.getSnapshot().path("nodes"))if(n.path("seq").asInt()==seq)return n.path("conditionText").isTextual()?n.path("conditionText").asText():null;return null;}
    private List<Map<String,Object>> logRows(Long id){return logs.selectList(Wrappers.<ApprovalLog>lambdaQuery().eq(ApprovalLog::getApplicationId,id).orderByAsc(ApprovalLog::getId)).stream().map(l->map("id",l.getId(),"action",l.getAction(),"operatorName",l.getOperatorName(),"nodeName",l.getNodeName(),"comment",l.getComment(),"fromStatus",l.getFromStatus(),"toStatus",l.getToStatus(),"appVersion",l.getAppVersion(),"templateVersionNo",l.getTemplateVersionNo(),"createdAt",l.getCreatedAt())).toList();}
    private Application own(Long id,CurrentUser u){Application a=applications.selectById(id);if(a==null||a.getDeletedAt()!=null||!u.id().equals(a.getApplicantId()))throw BizException.notFound();return a;}
    private void requireCreate(CurrentUser u){if(!u.has(Perms.APP_CREATE))throw BizException.forbidden();}
    private void requireTemplate(ProcessTemplate t,String type,CurrentUser u){if(t==null||!type.equals(t.getBizType())||!Boolean.TRUE.equals(t.getEnabled())||t.getCurrentVersionId()==null||!templateDepartments.appliesTo(t.getId(),u.deptId()))throw BizException.rule("templateId","TEMPLATE_UNAVAILABLE","模板不存在、未发布、已停用或不适用于本部门");}
    private Application newDraft(String type,Long templateId,CurrentUser u,Long source){Application a=new Application();a.setType(type);a.setTemplateId(templateId);a.setApplicantId(u.id());a.setDeptId(u.deptId());a.setStatus("DRAFT");a.setVersion(0);a.setSourceApplicationId(source);String prefix=switch(type){case "PURCHASE"->"CG";case "TRAVEL"->"CL";case "EXPENSE"->"BX";default->"ZD";};Long sequence=jdbc.queryForObject("SELECT nextval('app_no_seq')",Long.class);a.setAppNo(prefix+LocalDate.now(clock).format(DateTimeFormatter.BASIC_ISO_DATE)+String.format("%06d",sequence));return a;}
    private void setDraftValues(Application a,String title,Long amount){applications.update(null,Wrappers.<Application>lambdaUpdate().set(Application::getTitle,title).set(Application::getAmountCents,amount).eq(Application::getId,a.getId()));}
    private static Map<String,Object> saved(Application a){return map("id",a.getId(),"appNo",a.getAppNo(),"version",a.getVersion());}
    private static Map<String,Object> link(Application a){return map("id",a.getId(),"appNo",a.getAppNo(),"status",a.getStatus());}
    private static String title(Object r){return r instanceof Purchase p?p.title():r instanceof Travel t?t.title():r instanceof Expense e?e.title():((Custom)r).title();}
    private static Integer version(Object r){return r instanceof Purchase p?p.version():r instanceof Travel t?t.version():r instanceof Expense e?e.version():((Custom)r).version();}
    private static void remapArray(ObjectNode node,String key,Map<Long,Long> ids){if(node.path(key).isArray()){var a=Jsons.MAPPER.createArrayNode();for(JsonNode id:node.path(key)){Long target=ids.get(id.longValue());if(target!=null)a.add(target);}node.set(key,a);}}
    private boolean revealDuplicates(CurrentUser u,Application a){return !u.id().equals(a.getApplicantId())&&(u.hasRole(Perms.ROLE_FINANCE_APPROVER)||tasks.existsByAppAndAssignee(a.getId(),u.id()));}
    static void checkPage(int page,int size){if(page<1||size<1||size>100||page>1000000)throw new BizException(ErrorCode.BAD_REQUEST,"分页参数不正确");}
}

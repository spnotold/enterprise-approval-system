package edu.zju.eas.service.template;

import edu.zju.eas.common.Jsons;
import edu.zju.eas.common.Times;
import edu.zju.eas.dto.template.TemplateDtos.ValidationIssue;
import edu.zju.eas.model.org.Department;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.DepartmentMapper;
import edu.zju.eas.repository.AuthQueryMapper;
import edu.zju.eas.repository.FlowQueryMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.security.Perms;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/** 发布前的完整配置校验。只接受引擎实际支持的规则；错误集中返回给设计器。 */
@Component
@RequiredArgsConstructor
public class TemplatePublishValidator {
    private final DepartmentMapper departments;
    private final SysUserMapper users;
    private final FlowQueryMapper flow;
    private final AuthQueryMapper permissions;
    private static final Set<String> RESERVED=Set.of("amountcents","naturaldays","id","applicationid","applicantid","deptid","status","version","templateid","templateversionid","createdat","submittedat","finishedat","__proto__","constructor","prototype");
    private static final Set<String> MIME=Set.of("image/jpeg","image/png","application/pdf");
    private static final Set<String> ROLES=Set.of("EMPLOYEE","DEPT_HEAD","FINANCE_APPROVER","ENTERPRISE_HEAD");
    private static final Map<String,Set<String>> ALLOWED_RULES=Map.of(
            "TEXT",Set.of("minLength","maxLength","patternPreset","pattern","patternMessage"),
            "TEXTAREA",Set.of("minLength","maxLength"),"NUMBER",Set.of("min","max","precision","step"),
            "AMOUNT",Set.of("minCents","maxCents"),"DATE",Set.of("earliest","latest","notBefore"),
            "RADIO",Set.of(),"ATTACHMENT",Set.of("maxCount","allowedTypes","maxSizeMb"));

    public List<ValidationIssue> validate(ProcessTemplate template,ProcessTemplateVersion version,List<Long> deptIds) {
        List<ValidationIssue> out=new ArrayList<>();
        if (blank(template.getName()) || template.getName().trim().length()<2 || template.getName().length()>50
                || template.getCode()==null || !template.getCode().matches("[A-Za-z][A-Za-z0-9_]{1,49}")
                || (template.getDescription()!=null && template.getDescription().length()>500))
            add(out,"TPL_BASIC","name","模板名称、编码或说明不合法");
        if(deptIds==null) {add(out,"TPL_BASIC","deptIds","适用部门配置缺失");deptIds=List.of();}
        if(new HashSet<>(deptIds).size()!=deptIds.size()) add(out,"TPL_BASIC","deptIds","适用部门不得重复");
        List<Department> applicable=deptIds.isEmpty()?departments.listActive():new ArrayList<>();
        if(!deptIds.isEmpty()) for(Long id:deptIds) {
            Department d=id==null?null:departments.selectById(id);
            if(d==null || d.getDeletedAt()!=null) add(out,"TPL_BASIC","deptIds","适用部门不存在或已删除"); else applicable.add(d);
        }
        FormSchema schema=version==null?null:version.getFormSchema();
        if(schema==null) {add(out,"TPL_FIELD_EMPTY","fields","缺少表单定义");schema=new FormSchema();}
        List<FormField> fields=schema.getFields()==null?List.of():schema.getFields();
        boolean builtin=ProcessTemplate.BUILTIN.equals(template.getCategory());
        if(builtin) {
            if(!Objects.equals(schema.getBuiltin(),template.getBizType()) || !fields.isEmpty()) add(out,"TPL_FIELD_INVALID","formSchema","内置模板表单固定，不得改为自定义字段");
        } else {
            if(schema.getBuiltin()!=null) add(out,"TPL_FIELD_INVALID","formSchema.builtin","自定义模板不得声明内置表单");
            if(fields.isEmpty()) add(out,"TPL_FIELD_EMPTY","fields","自定义模板至少需要一个字段");
        }
        if(fields.size()>100) add(out,"TPL_FIELD_INVALID","fields","字段数量不得超过100个");
        Map<String,FormField> byKey=new LinkedHashMap<>(); Set<String> lower=new HashSet<>();int amounts=0;
        for(int i=0;i<fields.size();i++) {
            FormField f=fields.get(i);String p="fields["+i+"]";
            if(f==null){add(out,"TPL_FIELD_INVALID",p,"字段不得为空");continue;}
            if(f.getKey()==null || !f.getKey().matches("[A-Za-z][A-Za-z0-9_]{0,49}")) add(out,"TPL_FIELD_INVALID",p+".key","字段标识须以字母开头，最长50位");
            else {
                String k=f.getKey().toLowerCase(Locale.ROOT);
                if(!lower.add(k) || RESERVED.contains(k)) add(out,"TPL_FIELD_KEY_DUP",p+".key","字段标识重复或使用保留字");
                byKey.put(f.getKey(),f);
            }
            if(blank(f.getLabel()) || f.getLabel().length()>50) add(out,"TPL_FIELD_INVALID",p+".label","字段名称须为1至50字");
            if(f.getType()==null || !FormField.TYPES.contains(f.getType())) {add(out,"TPL_FIELD_INVALID",p+".type","字段类型不合法");continue;}
            if((f.getPlaceholder()!=null && f.getPlaceholder().length()>200) || (f.getHelp()!=null && f.getHelp().length()>500)) add(out,"TPL_FIELD_INVALID",p,"占位提示或帮助文字过长");
            if(f.isStatAmount()){amounts++;if(!FormField.AMOUNT.equals(f.getType())) add(out,"TPL_FIELD_INVALID",p+".statAmount","只有金额字段可以作为统计金额");}
            if(FormField.RADIO.equals(f.getType())) {
                List<FieldOption> options=f.getOptions();Set<String> values=new HashSet<>();
                if(options==null || options.size()<2 || options.size()>20) add(out,"TPL_FIELD_INVALID",p+".options","单选需要2至20个选项");
                if(options!=null) for(FieldOption option:options)
                    if(option==null || blank(option.getValue()) || blank(option.getLabel()) || option.getValue().length()>100 || option.getLabel().length()>100 || !option.getValue().equals(option.getValue().trim()) || !values.add(option.getValue())) add(out,"TPL_FIELD_INVALID",p+".options","选项名称和值须为1至100字，值无首尾空白且唯一");
            } else if(f.getOptions()!=null && !f.getOptions().isEmpty()) add(out,"TPL_FIELD_INVALID",p+".options","只有单选字段可配置选项");
            validateRules(f,p,out);
        }
        if(amounts>1) add(out,"TPL_FIELD_INVALID","fields","至多一个统计金额字段");
        for(int i=0;i<fields.size();i++) {
            FormField f=fields.get(i);if(f==null || f.getRules()==null || f.getRules().getNotBefore()==null) continue;
            String reference=f.getRules().getNotBefore();FormField other=byKey.get(reference);
            if(other==null || !FormField.DATE.equals(other.getType()) || Objects.equals(f.getKey(),reference)) add(out,"TPL_FIELD_INVALID","fields["+i+"].rules.notBefore","引用必须指向另一个日期字段");
        }
        NodeConfig config=version==null?null:version.getNodeConfig();List<NodeDef> nodes=config==null || config.getNodes()==null?List.of():config.getNodes();
        if(nodes.size()<2 || nodes.size()>10) add(out,"TPL_NODE_COUNT","nodes","必须配置2至10个顺序审批节点");
        Set<String> keys=new HashSet<>();boolean unconditional=false;
        for(int i=0;i<nodes.size();i++) {
            NodeDef n=nodes.get(i);String p="nodes["+i+"]";
            if(n==null){add(out,"TPL_NODE_INCOMPLETE",p,"节点不得为空");continue;}
            if(blank(n.getNodeKey()) || !n.getNodeKey().matches("[A-Za-z][A-Za-z0-9_]{0,31}") || !keys.add(n.getNodeKey().toLowerCase(Locale.ROOT))) add(out,"TPL_CYCLE",p+".nodeKey","顺序节点的标识须为1至32位且不得重复");
            if(blank(n.getName()) || n.getName().length()>50) add(out,"TPL_NODE_INCOMPLETE",p+".name","节点名称须为1至50字");
            String mode=n.modeOrDefault();
            if(!List.of(NodeDef.SINGLE,NodeDef.COUNTERSIGN,NodeDef.OR_SIGN).contains(mode)) add(out,"TPL_NODE_INCOMPLETE",p+".mode","不支持的审批模式");
            if(n.getTimeoutHours()!=null && (n.getTimeoutHours()<1 || n.getTimeoutHours()>8760)) add(out,"TPL_NODE_INCOMPLETE",p+".timeoutHours","节点超时须为1至8760小时");
            approver(n.getApproverRule(),mode,applicable,p+".approverRule",out);
            if(n.getFallbackRule()!=null) approver(n.getFallbackRule(),NodeDef.SINGLE,applicable,p+".fallbackRule",out);
            if(n.getCondition()==null) unconditional=true;
            else condition(n.getCondition(),byKey,builtin,p+".condition",out);
        }
        if(!unconditional) add(out,"TPL_ALL_SKIPPABLE","nodes","至少一个节点必须无条件执行");
        return List.copyOf(out);
    }

    private void validateRules(FormField f,String path,List<ValidationIssue> out) {
        FieldRules r=f.rulesOrEmpty();String p=path+".rules";
        Jsons.tree(r).fieldNames().forEachRemaining(key->{if(!ALLOWED_RULES.get(f.getType()).contains(key)) add(out,"TPL_FIELD_INVALID",p+"."+key,"校验规则与字段类型不匹配");});
        try {
            switch(f.getType()) {
                case "TEXT","TEXTAREA" -> {
                    int cap=FormField.TEXT.equals(f.getType())?200:2000;
                    if((r.getMinLength()!=null && (r.getMinLength()<0 || r.getMinLength()>cap)) || (r.getMaxLength()!=null && (r.getMaxLength()<1 || r.getMaxLength()>cap)) || (r.getMinLength()!=null && r.getMaxLength()!=null && r.getMinLength()>r.getMaxLength())) throw new IllegalArgumentException();
                    if(r.getPatternPreset()!=null && !List.of("MOBILE","EMAIL").contains(r.getPatternPreset())) throw new IllegalArgumentException();
                    if(r.getPattern()!=null) {if(r.getPattern().isBlank() || r.getPattern().length()>500 || r.getPatternPreset()!=null) throw new IllegalArgumentException();Pattern.compile(r.getPattern());}
                    if(r.getPatternMessage()!=null && (r.getPatternMessage().isBlank() || r.getPatternMessage().length()>200 || (r.getPattern()==null && r.getPatternPreset()==null))) throw new IllegalArgumentException();
                }
                case "NUMBER" -> {
                    BigDecimal min=decimal(r.getMin()),max=decimal(r.getMax()),step=decimal(r.getStep());
                    if((min!=null && max!=null && min.compareTo(max)>0) || (step!=null && step.signum()<=0) || (r.getPrecision()!=null && (r.getPrecision()<0 || r.getPrecision()>4))) throw new IllegalArgumentException();
                    int precision=r.getPrecision()==null?4:r.getPrecision();
                    for(BigDecimal value:Arrays.asList(min,max,step)) if(value!=null && Math.max(0,value.stripTrailingZeros().scale())>precision) throw new IllegalArgumentException();
                }
                case "AMOUNT" -> {
                    if((r.getMinCents()!=null && r.getMinCents()<0) || (r.getMaxCents()!=null && r.getMaxCents()<0) || (r.getMinCents()!=null && r.getMaxCents()!=null && r.getMinCents()>r.getMaxCents())) throw new IllegalArgumentException();
                }
                case "DATE" -> {
                    LocalDate min=date(r.getEarliest()),max=date(r.getLatest());if(min!=null && max!=null && min.isAfter(max)) throw new IllegalArgumentException();
                }
                case "ATTACHMENT" -> {
                    if((r.getMaxCount()!=null && (r.getMaxCount()<1 || r.getMaxCount()>10)) || (r.getMaxSizeMb()!=null && (r.getMaxSizeMb()<1 || r.getMaxSizeMb()>10))) throw new IllegalArgumentException();
                    if(r.getAllowedTypes()!=null && (r.getAllowedTypes().isEmpty() || r.getAllowedTypes().stream().anyMatch(v->v==null || !MIME.contains(v)) || new HashSet<>(r.getAllowedTypes()).size()!=r.getAllowedTypes().size())) throw new IllegalArgumentException();
                }
                default -> { }
            }
        } catch(RuntimeException e) {add(out,"TPL_FIELD_INVALID",p,"字段规则无效：检查范围、精度、正则、日期或附件限制");}
    }

    private void approver(ApproverRule r,String mode,List<Department> applicable,String p,List<ValidationIssue> out) {
        if(r==null || r.getType()==null){add(out,"TPL_NODE_INCOMPLETE",p,"请配置审批人规则");return;}
        boolean single=NodeDef.SINGLE.equals(mode);
        switch(r.getType()) {
            case ApproverRule.SPECIFIED_USER -> {
                List<Long> ids=r.getUserIds();boolean hasList=ids!=null && !ids.isEmpty();
                if(r.getRoleCode()!=null || (r.getUserId()!=null && hasList) || (r.getUserId()==null && !hasList) || (single && hasList && ids.size()!=1)) {add(out,"TPL_NODE_INCOMPLETE",p,"指定用户规则须配置明确的单人或多人候选名单");return;}
                List<Long> candidates=hasList?ids:List.of(r.getUserId());
                if(candidates.size()>100 || new HashSet<>(candidates).size()!=candidates.size()) add(out,"TPL_APPROVER_INVALID",p,"候选审批人重复或超过100人");
                for(Long id:candidates) if(!validUser(id)) add(out,"TPL_APPROVER_INVALID",p,"每位候选审批人必须存在、已启用且可参与业务审批");
            }
            case ApproverRule.APPLICANT_DEPT_HEAD -> {
                if(!single || r.getUserId()!=null || r.getUserIds()!=null || r.getRoleCode()!=null) add(out,"TPL_NODE_INCOMPLETE",p,"部门负责人规则仅支持单人审批，不能混用用户或角色配置");
                if(applicable.isEmpty()) add(out,"TPL_APPROVER_INVALID",p,"没有可用的适用部门");
                for(Department d:applicable) if(!validUser(d.getHeadUserId())) add(out,"TPL_APPROVER_INVALID",p,"部门“"+d.getName()+"”未设置有效负责人");
            }
            case ApproverRule.ROLE -> {
                if(r.getRoleCode()==null || !ROLES.contains(r.getRoleCode()) || r.getUserId()!=null || r.getUserIds()!=null) {add(out,"TPL_NODE_INCOMPLETE",p,"角色规则不完整或角色不支持审批");return;}
                if(single) {if(!validUser(flow.primaryHandlerOf(r.getRoleCode()))) add(out,"TPL_APPROVER_INVALID",p,"该角色没有有效主办人");}
                else {List<Long> holders=flow.holdersOf(r.getRoleCode());if(holders.isEmpty() || holders.stream().anyMatch(id->!validUser(id))) add(out,"TPL_APPROVER_INVALID",p,"角色候选审批人为空或含无效账号");}
            }
            default -> add(out,"TPL_NODE_INCOMPLETE",p,"未知的审批人规则");
        }
    }
    private boolean validUser(Long id) {
        SysUser u=id==null?null:users.selectById(id);
        return u!=null && SysUser.ACTIVE.equals(u.getStatus()) && !flow.isSysAdmin(id)
                && permissions.permissionCodes(id).contains(Perms.TASK_HANDLE);
    }
    private void condition(Condition c,Map<String,FormField> fields,boolean builtin,String path,List<ValidationIssue> out) {
        if(!List.of("AND","OR").contains(c.getLogic()==null?"":c.getLogic()) || c.getRules()==null || c.getRules().isEmpty() || c.getRules().size()>50) {add(out,"TPL_CONDITION_REF",path,"条件须有AND/OR逻辑及1至50条规则");return;}
        for(int i=0;i<c.getRules().size();i++) {
            ConditionRule r=c.getRules().get(i);String p=path+".rules["+i+"]";
            if(r==null){add(out,"TPL_CONDITION_REF",p,"条件规则不得为空");continue;}
            FormField f=fields.get(r.getVar());String type=f==null?null:f.getType();
            if(builtin && "amountCents".equals(r.getVar())) type="AMOUNT";
            if(builtin && "naturalDays".equals(r.getVar())) type="NUMBER";
            if(type==null || !Set.of("NUMBER","AMOUNT","DATE","RADIO").contains(type) || r.getOp()==null || !ConditionRule.OPS.contains(r.getOp())) {add(out,"TPL_CONDITION_REF",p,"条件引用的字段或运算符无效");continue;}
            if("RADIO".equals(type) && !List.of("EQ","NE","IN").contains(r.getOp())) {add(out,"TPL_CONDITION_REF",p,"单选字段仅支持等于、不等于、属于");continue;}
            try {
                List<String> expected;
                if("IN".equals(r.getOp())) {expected=r.getValues();if(expected==null || expected.isEmpty() || expected.size()>100 || r.getValue()!=null) throw new IllegalArgumentException();}
                else {if(r.getValue()==null || r.getValues()!=null) throw new IllegalArgumentException();expected=List.of(r.getValue());}
                for(String value:expected) {
                    if(blank(value)) throw new IllegalArgumentException();
                    switch(type) {
                        case "NUMBER" -> decimal(value);
                        case "AMOUNT" -> {if(Long.parseLong(value)<0) throw new IllegalArgumentException();}
                        case "DATE" -> LocalDate.parse(value);
                        case "RADIO" -> {if(f.getOptions()==null || f.getOptions().stream().noneMatch(o->o!=null && value.equals(o.getValue()))) throw new IllegalArgumentException();}
                        default -> throw new IllegalArgumentException();
                    }
                }
            } catch(RuntimeException e) {add(out,"TPL_CONDITION_REF",p,"条件值不能解析为字段类型或不在单选选项内");}
        }
    }
    private static BigDecimal decimal(String value) {
        if(value==null) return null;
        if(value.length()>50 || !value.matches("-?\\d+(\\.\\d+)?")) throw new IllegalArgumentException();
        return new BigDecimal(value);
    }
    private static LocalDate date(String value) {
        if(value==null) return null;
        if(value.matches("TODAY([+-]\\d{1,4})?")) return LocalDate.now(Times.ZONE).plusDays(value.length()==5?0:Integer.parseInt(value.substring(5)));
        return LocalDate.parse(value);
    }
    private static boolean blank(String s){return s==null || s.isBlank();}
    private static void add(List<ValidationIssue> out,String code,String path,String message){out.add(new ValidationIssue(code,path,message));}
}

package edu.zju.eas.service.app;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.zju.eas.dto.app.BusinessRequests.*;
import edu.zju.eas.model.app.*;
import edu.zju.eas.model.common.Attachment;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.*;
import edu.zju.eas.response.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.net.URI;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;
import static edu.zju.eas.service.app.BusinessDataService.*;

@Component
@RequiredArgsConstructor
public class BusinessValidator {
    private final ApplicationMapper applications;
    private final ExpenseTypeMapper expenseTypes;
    private final SysUserMapper users;
    private final ProcessTemplateMapper templates;
    private final ProcessTemplateVersionMapper versions;
    private final AttachmentMapper attachments;
    private final Clock clock;

    public void validate(Application app,Object body,boolean full) {
        FieldErrors e=new FieldErrors();
        String title=body instanceof Purchase r?r.title():body instanceof Travel r?r.title():body instanceof Expense r?r.title():((Custom)body).title();
        if(full && blank(title))e.add("title","REQUIRED","请填写标题");
        if(body instanceof Purchase p)purchase(p,e,full);
        if(body instanceof Travel t)travel(app,t,e,full);
        if(body instanceof Expense x)expense(app,x,e,full);
        if(body instanceof Custom c)custom(app,c,e,full);
        e.throwIfAny(full?ErrorCode.BIZ_RULE:ErrorCode.BAD_REQUEST);
    }

    private void purchase(Purchase r,FieldErrors e,boolean full) {
        dateYear(r.expectedArrivalDate(),"expectedArrivalDate",e);
        var qs=list(r.quotes());var items=list(r.items());Set<String> suppliers=new HashSet<>();
        if(r.selectedQuoteIndex()!=null && (r.selectedQuoteIndex()<0||r.selectedQuoteIndex()>=qs.size()))e.add("selectedQuoteIndex","PUR_SELECTED_INVALID","拟选报价不属于本单");
        long lowest=Long.MAX_VALUE;
        for(int i=0;i<qs.size();i++) {
            var q=qs.get(i);String p="quotes["+i+"].";
            if(!blank(q.supplierName())&&!suppliers.add(q.supplierName().replaceAll("\\s+","").toLowerCase(Locale.ROOT)))e.add(p+"supplierName","PUR_QUOTES_INSUFFICIENT","供应商不能重复");
            if(!blank(q.url())&&!httpUrl(q.url()))e.add(p+"url","PUR_QUOTE_EVIDENCE","请输入 http 或 https 链接");
            if(full){
                if(blank(q.supplierName()))e.add(p+"supplierName","REQUIRED","请填写供应商");
                if(q.quoteAmountCents()==null||q.quoteAmountCents()<=0)e.add(p+"quoteAmountCents","REQUIRED","报价金额必须大于 0");
                if("ONLINE".equals(q.channel())){
                    if(blank(q.url())||list(q.attachmentIds()).isEmpty())e.add(p+"attachmentIds","PUR_QUOTE_EVIDENCE","线上报价需要链接及至少一张截图");
                }else if(list(q.attachmentIds()).isEmpty()&&blank(q.description()))e.add(p+"description","PUR_QUOTE_EVIDENCE","线下报价需要附件或报价说明");
            }
            if(q.quoteAmountCents()!=null)lowest=Math.min(lowest,q.quoteAmountCents());
        }
        for(int i=0;i<items.size();i++) {
            var item=items.get(i);String p="items["+i+"].";
            if(item.quantity()!=null && new BigDecimal(item.quantity()).signum()<=0)e.add(p+"quantity","PUR_ITEMS_REQUIRED","数量必须大于 0");
            if(full){
                if(blank(item.name()))e.add(p+"name","PUR_ITEMS_REQUIRED","请填写名称");
                if(blank(item.unit()))e.add(p+"unit","PUR_ITEMS_REQUIRED","请填写单位");
                if(item.quantity()==null)e.add(p+"quantity","PUR_ITEMS_REQUIRED","请填写数量");
                if(item.unitPriceCents()==null||item.unitPriceCents()<=0)e.add(p+"unitPriceCents","PUR_ITEMS_REQUIRED","单价必须大于 0");
            }
        }
        if(!full)return;
        if(items.isEmpty())e.add("items","PUR_ITEMS_REQUIRED","至少填写一条采购明细");
        if(blank(r.reason()))e.add("reason","REQUIRED","请填写采购事由");
        if(r.budgetLimitCents()==null)e.add("budgetLimitCents","REQUIRED","请填写预算上限");
        if(r.expectedArrivalDate()==null||r.expectedArrivalDate().isBefore(LocalDate.now(clock)))e.add("expectedArrivalDate","PUR_ARRIVAL_DATE","期望到货日期不得早于今天");
        if(r.singleSource()){
            if(length(r.singleSourceReason())<20)e.add("singleSourceReason","PUR_SINGLE_SOURCE","单一来源说明至少 20 字，并写明依据或附说明材料");
            if(qs.isEmpty())e.add("quotes","PUR_QUOTES_INSUFFICIENT","至少填写一家报价");
        }else if(suppliers.size()<2)e.add("quotes","PUR_QUOTES_INSUFFICIENT","至少需要两家不同供应商报价");
        if(r.selectedQuoteIndex()==null)e.add("selectedQuoteIndex","PUR_SELECTED_INVALID","请选择拟选报价");
        else if(r.selectedQuoteIndex()>=0&&r.selectedQuoteIndex()<qs.size()){
            Long amount=qs.get(r.selectedQuoteIndex()).quoteAmountCents();
            if(amount!=null&&amount>lowest&&length(r.notLowestReason())<10)e.add("notLowestReason","PUR_NOT_LOWEST_REASON","未选最低价理由至少 10 字");
            if(amount!=null&&r.budgetLimitCents()!=null&&amount>r.budgetLimitCents())e.add("budgetLimitCents","PUR_OVER_BUDGET","拟选报价超过预算上限");
        }
    }

    private void travel(Application app,Travel r,FieldErrors e,boolean full) {
        boolean startYear=dateYear(r.startTime()==null?null:r.startTime().toLocalDate(),"startTime",e);
        boolean endYear=dateYear(r.endTime()==null?null:r.endTime().toLocalDate(),"endTime",e);
        if(r.startTime()!=null&&r.endTime()!=null&&startYear&&endYear){
            if(r.endTime().isBefore(r.startTime()))e.add("endTime","TRAVEL_TIME","结束时间不能早于开始时间");
            if(ChronoUnit.DAYS.between(r.startTime().atZoneSameInstant(CN).toLocalDate(),r.endTime().atZoneSameInstant(CN).toLocalDate())+1>90)e.add("endTime","TRAVEL_TIME","出差跨度不能超过 90 天");
        }
        Set<Long> seen=new HashSet<>();int i=0;for(var c:list(r.companions())){
            String p="companions["+(i++)+"].userId";
            if(c.userId()!=null){
                SysUser user=users.selectById(c.userId());
                if(user==null||!"ACTIVE".equals(user.getStatus())||app.getApplicantId().equals(c.userId())||!seen.add(c.userId()))e.add(p,"TRAVEL_COMPANION","同行人员必须启用、不能是本人或重复");
                if(!blank(c.name()))e.add(p,"TRAVEL_COMPANION","系统用户和文本姓名只能选择一种");
            }
        }
        if(!full)return;
        if(blank(r.origin()))e.add("origin","REQUIRED","请填写出发地");if(blank(r.destination()))e.add("destination","REQUIRED","请填写目的地");
        if(r.startTime()==null)e.add("startTime","REQUIRED","请选择开始时间");if(r.endTime()==null)e.add("endTime","REQUIRED","请选择结束时间");
        if(blank(r.transport()))e.add("transport","REQUIRED","请选择交通方式");if(blank(r.purpose()))e.add("purpose","REQUIRED","请填写出差事由");if(r.budgetCents()==null)e.add("budgetCents","REQUIRED","请填写预算");
    }

    private void expense(Application app,Expense r,FieldErrors e,boolean full) {
        for(Long id:list(r.relatedApplicationIds())){
            Application related=applications.selectById(id);
            if(related==null||related.getDeletedAt()!=null||!app.getApplicantId().equals(related.getApplicantId())||!"APPROVED".equals(related.getStatus())||!("TRAVEL".equals(related.getType())||"PURCHASE".equals(related.getType())))e.add("relatedApplicationIds","EXP_LINK_INVALID","只能关联本人已通过的差旅或采购单");
        }
        int i=0;for(var item:list(r.items())){
            String p="items["+(i++)+"].";
            dateYear(item.occurDate(),p+"occurDate",e);
            if(!blank(item.expenseTypeCode())){
                var t=expenseTypes.selectOne(Wrappers.<ExpenseType>lambdaQuery().eq(ExpenseType::getCode,item.expenseTypeCode()));
                if(t==null||(full&&!Boolean.TRUE.equals(t.getEnabled())))e.add(p+"expenseTypeCode","EXP_ITEM_TYPE","请选择启用的费用类型");
            }
            if(!full)continue;
            if(blank(item.expenseTypeCode())&&item.occurDate()==null&&blank(item.purpose())&&item.amountCents()==null&&!item.noInvoice()&&list(item.invoices()).isEmpty())e.add(p.substring(0,p.length()-1),"EXP_EMPTY_ITEM","不能提交空白明细行");
            if(blank(item.expenseTypeCode()))e.add(p+"expenseTypeCode","EXP_ITEM_TYPE","请选择费用类型");
            LocalDate today=LocalDate.now(clock);
            if(item.occurDate()==null||item.occurDate().isAfter(today)||item.occurDate().isBefore(today.minusDays(365)))e.add(p+"occurDate","EXP_ITEM_DATE","发生日期必须在过去 365 天内");
            if(blank(item.purpose()))e.add(p+"purpose","REQUIRED","请填写费用用途");
            if(item.amountCents()==null||item.amountCents()<=0||item.amountCents()>10000000)e.add(p+"amountCents","EXP_ITEM_AMOUNT","单条金额须大于 0 且不超过十万元");
            if(item.noInvoice()){
                if(length(item.noInvoiceReason())<10||!list(item.invoices()).isEmpty())e.add(p+"noInvoiceReason","EXP_NO_INVOICE_REASON","无票原因至少 10 字且不能同时挂票据");
            }else if(list(item.invoices()).isEmpty())e.add(p+"invoices","EXP_INVOICE_REQUIRED","请上传票据或勾选无票");
        }
        if(full&&list(r.items()).isEmpty())e.add("items","EXP_EMPTY_ITEM","至少填写一条报销明细");
        if(full&&list(r.relatedApplicationIds()).isEmpty()&&blank(r.independentReason()))e.add("independentReason","EXP_LINK_INVALID","请关联申请或填写独立报销说明");
    }

    public void validateInvoices(Expense r,Map<Long,Attachment> pool) {
        Set<String> hashes=new HashSet<>(),numbers=new HashSet<>();FieldErrors e=new FieldErrors();int i=0;
        for(var item:list(r.items())){
            String field="items["+(i++)+"].invoices";
            for(var invoice:list(item.invoices())){
                var file=pool.get(invoice.attachmentId());String no=normalizeInvoice(invoice.invoiceNo());
                if(file==null)e.add(field,"ATTACHMENT_INVALID","附件不存在或未绑定到本单");
                else if(!hashes.add(file.getSha256()))e.add(field,"EXP_DUP_INVOICE_IN_APP","同一报销单不能重复使用相同文件");
                if(no!=null&&!numbers.add(no))e.add(field,"EXP_DUP_INVOICE_IN_APP","同一报销单不能重复使用相同票据号");
            }
        }e.throwIfAny();
    }

    private void custom(Application app,Custom r,FieldErrors e,boolean full) {
        ProcessTemplate template=templates.selectById(app.getTemplateId());
        ProcessTemplateVersion version=r.templateVersionId()==null?null:versions.selectById(r.templateVersionId());
        if(version==null||!app.getTemplateId().equals(version.getTemplateId()))throw new BizException(ErrorCode.TEMPLATE_UPDATED);
        if(!full&&!version.getId().equals(template.getCurrentVersionId()))throw new BizException(ErrorCode.TEMPLATE_UPDATED);
        JsonNode values=r.formValues();if(values!=null&&!values.isObject()){e.add("formValues","FORM_TYPE","表单值必须是对象");return;}
        if(values==null)values=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        Set<String> known=new HashSet<>();for(FormField f:version.getFormSchema().getFields())known.add(f.getKey());
        for(Iterator<String> it=values.fieldNames();it.hasNext();){String key=it.next();if(!known.contains(key))e.add("formValues."+key,"FORM_UNKNOWN_FIELD","表单包含未定义字段");}
        for(FormField f:version.getFormSchema().getFields()){
            JsonNode v=values.get(f.getKey());String p="formValues."+f.getKey();FieldRules rules=f.rulesOrEmpty();
            if(v!=null&&v.isTextual()&&("TEXT".equals(f.getType())||"TEXTAREA".equals(f.getType()))){
                int limit="TEXT".equals(f.getType())?200:2000;
                int maximum=Math.min(rules.getMaxLength()==null?limit:rules.getMaxLength(),limit);
                String text=v.asText();
                if(text.codePointCount(0,text.length())>maximum){e.add(p,"FORM_LENGTH","文字长度不能超过 "+maximum+" 字");continue;}
            }
            boolean empty=v==null||v.isNull()||(v.isTextual()&&v.asText().isBlank())||(v.isArray()&&v.isEmpty()&&"ATTACHMENT".equals(f.getType()));
            if(empty){if(full&&f.isRequired())e.add(p,"FORM_REQUIRED","请填写"+f.getLabel());continue;}
            try{
                switch(f.getType()){
                    case "TEXT","TEXTAREA" -> {
                        if(!v.isTextual())throw new IllegalArgumentException();String text=v.asText();int len=length(text);
                        if(full&&rules.getMinLength()!=null&&len<rules.getMinLength())e.add(p,"FORM_LENGTH","文字长度不符合要求");
                        String pattern=rules.getPattern();if("MOBILE".equals(rules.getPatternPreset()))pattern="^1[3-9]\\d{9}$";if("EMAIL".equals(rules.getPatternPreset()))pattern="^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
                        if(pattern!=null&&!Pattern.matches(pattern,text))e.add(p,"FORM_PATTERN",rules.getPatternMessage()==null?"格式不符合要求":rules.getPatternMessage());
                    }
                    case "NUMBER" -> {
                        if(!v.isTextual()||v.asText().length()>40||!v.asText().matches("-?\\d+(?:\\.\\d+)?"))throw new IllegalArgumentException();
                        BigDecimal n=new BigDecimal(v.asText());
                        if(n.scale()>(rules.getPrecision()==null?4:rules.getPrecision()))e.add(p,"FORM_NUMBER","小数位数过多");   // 未配置精度时最多 4 位小数（Q8）
                        if(rules.getMin()!=null&&n.compareTo(new BigDecimal(rules.getMin()))<0||rules.getMax()!=null&&n.compareTo(new BigDecimal(rules.getMax()))>0)e.add(p,"FORM_RANGE","数值超出允许范围");
                        if(rules.getStep()!=null){BigDecimal base=rules.getMin()==null?BigDecimal.ZERO:new BigDecimal(rules.getMin());if(n.subtract(base).remainder(new BigDecimal(rules.getStep())).signum()!=0)e.add(p,"FORM_STEP","数值不符合步长要求");}
                    }
                    case "AMOUNT" -> {
                        if(!v.isIntegralNumber()||!v.canConvertToLong()||v.longValue()<0||v.longValue()>9007199254740991L)throw new IllegalArgumentException();long n=v.longValue();
                        if(rules.getMinCents()!=null&&n<rules.getMinCents()||rules.getMaxCents()!=null&&n>rules.getMaxCents())e.add(p,"FORM_RANGE","金额超出允许范围");
                    }
                    case "DATE" -> {
                        if(!v.isTextual())throw new IllegalArgumentException();LocalDate date=LocalDate.parse(v.asText());
                        if(rules.getEarliest()!=null&&date.isBefore(boundDate(rules.getEarliest()))||rules.getLatest()!=null&&date.isAfter(boundDate(rules.getLatest())))e.add(p,"FORM_DATE","日期超出允许范围");
                        if(rules.getNotBefore()!=null){JsonNode other=values.get(rules.getNotBefore());if(other!=null&&other.isTextual()&&date.isBefore(LocalDate.parse(other.asText())))e.add(p,"FORM_DATE","日期不能早于关联日期");}
                    }
                    case "RADIO" -> {if(!v.isTextual()||f.getOptions()==null||f.getOptions().stream().noneMatch(o->o.getValue().equals(v.asText())))e.add(p,"FORM_OPTION","请选择有效选项");}
                    case "ATTACHMENT" -> {
                        if(!v.isArray())throw new IllegalArgumentException();Set<Long> seen=new HashSet<>();
                        if(v.size()>(rules.getMaxCount()==null?10:rules.getMaxCount()))e.add(p,"FORM_ATTACHMENT","附件数量超过限制");
                        for(JsonNode aid:v){if(!aid.isIntegralNumber()||!aid.canConvertToLong()||aid.longValue()<=0||!seen.add(aid.longValue()))throw new IllegalArgumentException();Attachment a=attachments.selectById(aid.longValue());
                            if(a!=null&&((rules.getAllowedTypes()!=null&&!rules.getAllowedTypes().contains(a.getContentType()))||(rules.getMaxSizeMb()!=null&&a.getSizeBytes()>rules.getMaxSizeMb()*1024L*1024)))e.add(p,"FORM_ATTACHMENT","附件类型或大小不符合字段要求");}
                    }
                    default -> e.add(p,"FORM_TYPE","字段类型不支持");
                }
            }catch(IllegalArgumentException|ArithmeticException|DateTimeException ex){e.add(p,"FORM_TYPE","字段值格式不正确");}
        }
    }

    /** 复制来源仍保留原值；仅新草稿中不再符合当前规则的字段清空，供申请人重新填写。 */
    public Custom sanitizeCopy(Application app,Custom input) {
        ObjectNode values=input.formValues()==null?com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode():input.formValues().deepCopy();
        int remaining=values.size()+1;
        while(remaining-->0){
            Custom candidate=new Custom(null,app.getTemplateId(),input.templateVersionId(),input.title(),values);
            try{validate(app,candidate,false);return candidate;}
            catch(BizException ex){
                if(ex.errorCode()!=ErrorCode.BAD_REQUEST)throw ex;
                boolean removed=false;
                for(FieldError error:ex.errors()){
                    if(error.field()!=null&&error.field().startsWith("formValues.")){
                        String key=error.field().substring("formValues.".length());
                        if(values.has(key)){values.remove(key);removed=true;}
                    }
                }
                if(!removed)throw ex;
            }
        }
        throw new IllegalStateException("复制表单清理未收敛");
    }

    /** 与客户端四位年份日期格式一致，先于 JDBC 写入检查，避免数据库日期范围溢出。 */
    private boolean dateYear(LocalDate date,String field,FieldErrors errors){
        if(date!=null&&(date.getYear()<1||date.getYear()>9999)){
            errors.add(field,"DATE_RANGE","日期年份需在 0001 至 9999 之间");return false;
        }
        return true;
    }
    private LocalDate boundDate(String expression){if(expression.startsWith("TODAY")){String suffix=expression.substring(5);return LocalDate.now(clock).plusDays(suffix.isEmpty()?0:Long.parseLong(suffix));}return LocalDate.parse(expression);}
    static int length(String value){return blank(value)?0:value.trim().codePointCount(0,value.trim().length());}
    static boolean httpUrl(String s){try{URI uri=URI.create(s);return Set.of("http","https").contains(uri.getScheme())&&uri.getHost()!=null;}catch(IllegalArgumentException e){return false;}}
}

package edu.zju.eas.service.app;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.dto.app.BusinessRequests.*;
import edu.zju.eas.model.app.*;
import edu.zju.eas.model.app.PurchaseItem;
import edu.zju.eas.model.app.ExpenseItem;
import edu.zju.eas.model.common.Attachment;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.*;
import edu.zju.eas.response.*;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.file.FileService;
import edu.zju.eas.service.flow.BizHandler;
import edu.zju.eas.service.flow.UserDirectory;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** 四类业务草稿的持久化与响应组装；申请行锁由 ApplicationService/FlowEngine 持有。 */
@Service
@RequiredArgsConstructor
public class BusinessDataService {
    static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    private final PurchaseDetailMapper purchases;
    private final PurchaseItemMapper purchaseItems;
    private final PurchaseQuoteMapper quotes;
    private final TravelDetailMapper travels;
    private final TravelCompanionMapper companions;
    private final ExpenseDetailMapper expenses;
    private final ExpenseItemMapper expenseItems;
    private final ExpenseInvoiceMapper invoices;
    private final ExpenseRelationMapper relations;
    private final ExpenseTypeMapper expenseTypes;
    private final CustomFormDataMapper customs;
    private final ProcessTemplateVersionMapper versions;
    private final ProcessTemplateMapper templates;
    private final ApplicationMapper applications;
    private final FileService files;
    private final UserDirectory users;
    private final BusinessValidator validator;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public Long save(Application app, Object request, CurrentUser user) {
        validator.validate(app, request, false);
        Map<Long,String> refs = attachmentRefs(app, request);
        Map<Long,Attachment> pool = files.bind(app, refs, user);
        Long amount;
        if (request instanceof Purchase r) {
            purchases.deleteById(app.getId());
            quotes.delete(Wrappers.<PurchaseQuote>lambdaQuery().eq(PurchaseQuote::getApplicationId, app.getId()));
            purchaseItems.delete(Wrappers.<PurchaseItem>lambdaQuery().eq(PurchaseItem::getApplicationId, app.getId()));
            long total = 0;
            for (int i=0; i<list(r.items()).size(); i++) {
                var in=r.items().get(i);
                PurchaseItem item=Jsons.convert(in, PurchaseItem.class);
                item.setApplicationId(app.getId()); item.setSeq(i+1);
                Long value=itemAmount(in.quantity(), in.unitPriceCents());
                item.setAmountCents(value); total=add(total, value);
                purchaseItems.insert(item);
            }
            List<Long> quoteIds=new ArrayList<>();
            for (int i=0; i<list(r.quotes()).size(); i++) {
                PurchaseQuote q=Jsons.convert(r.quotes().get(i), PurchaseQuote.class);
                q.setApplicationId(app.getId()); q.setSeq(i+1);
                q.setSupplierName(trim(q.getSupplierName()));
                if(q.getChannel()==null)q.setChannel("OFFLINE");
                q.setAttachmentIds(list(q.getAttachmentIds()));
                quotes.insert(q); quoteIds.add(q.getId());
            }
            PurchaseDetail d=Jsons.convert(r, PurchaseDetail.class);
            d.setApplicationId(app.getId()); d.setItemsTotalCents(total);
            d.setAttachmentIds(list(r.attachmentIds())); d.setSingleSourceAttachmentIds(list(r.singleSourceAttachmentIds()));
            d.setSelectedQuoteId(r.selectedQuoteIndex()==null ? null : quoteIds.get(r.selectedQuoteIndex()));
            purchases.insert(d);
            amount=r.selectedQuoteIndex()==null ? null : r.quotes().get(r.selectedQuoteIndex()).quoteAmountCents();
        } else if(request instanceof Travel r) {
            travels.deleteById(app.getId());
            companions.delete(Wrappers.<TravelCompanion>lambdaQuery().eq(TravelCompanion::getApplicationId,app.getId()));
            TravelDetail d=Jsons.convert(r,TravelDetail.class);d.setApplicationId(app.getId());d.setAttachmentIds(list(r.attachmentIds()));
            if(r.startTime()!=null && r.endTime()!=null) {
                d.setNaturalDays((int)ChronoUnit.DAYS.between(r.startTime().atZoneSameInstant(CN).toLocalDate(),r.endTime().atZoneSameInstant(CN).toLocalDate())+1);
                d.setDurationHours(BigDecimal.valueOf(Duration.between(r.startTime(),r.endTime()).toMinutes()).divide(BigDecimal.valueOf(60),1,RoundingMode.HALF_UP));
            }
            travels.insert(d);
            int seq=0;
            for(var in:list(r.companions())) {
                if(in.userId()==null && blank(in.name()))continue;
                TravelCompanion c=Jsons.convert(in,TravelCompanion.class);c.setApplicationId(app.getId());c.setSeq(++seq);
                c.setName(in.userId()==null ? trim(in.name()) : null);companions.insert(c);
            }
            amount=r.budgetCents();
        } else if(request instanceof Expense r) {
            validator.validateInvoices(r,pool);
            invoices.delete(Wrappers.<ExpenseInvoice>lambdaQuery().eq(ExpenseInvoice::getApplicationId,app.getId()));
            expenseItems.delete(Wrappers.<ExpenseItem>lambdaQuery().eq(ExpenseItem::getApplicationId,app.getId()));
            relations.delete(Wrappers.<ExpenseRelation>lambdaQuery().eq(ExpenseRelation::getExpenseApplicationId,app.getId()));
            expenses.deleteById(app.getId());
            long total=0;
            for(int i=0;i<list(r.items()).size();i++) {
                var in=r.items().get(i);ExpenseItem item=Jsons.convert(in,ExpenseItem.class);
                item.setApplicationId(app.getId());item.setSeq(i+1);
                if(!blank(in.expenseTypeCode()))item.setExpenseTypeId(type(in.expenseTypeCode()).getId());
                expenseItems.insert(item);total=add(total,in.amountCents());
                int seq=0;for(var iv:list(in.invoices())) {
                    ExpenseInvoice invoice=Jsons.convert(iv,ExpenseInvoice.class);
                    invoice.setApplicationId(app.getId());invoice.setExpenseItemId(item.getId());invoice.setSeq(++seq);
                    invoice.setInvoiceNo(trim(iv.invoiceNo()));invoice.setInvoiceNoNorm(normalizeInvoice(iv.invoiceNo()));
                    invoice.setFileSha256(pool.get(iv.attachmentId()).getSha256());invoices.insert(invoice);
                }
            }
            for(Long id:new LinkedHashSet<>(list(r.relatedApplicationIds()))) {
                ExpenseRelation relation=new ExpenseRelation();relation.setExpenseApplicationId(app.getId());relation.setRelatedApplicationId(id);relations.insert(relation);
            }
            ExpenseDetail d=Jsons.convert(r,ExpenseDetail.class);d.setApplicationId(app.getId());d.setTotalAmountCents(total);expenses.insert(d);amount=total;
        } else if(request instanceof Custom r) {
            CustomFormData d=new CustomFormData();d.setApplicationId(app.getId());
            d.setTemplateVersionId(r.templateVersionId());d.setFormValues(r.formValues()==null?Jsons.MAPPER.createObjectNode():r.formValues());
            customs.deleteById(app.getId());customs.insert(d);amount=customAmount(d);
        } else throw new BizException(ErrorCode.BAD_REQUEST);
        return amount;
    }

    public BizHandler.SubmitData prepare(Application app, CurrentUser user, boolean full) {
        Object request=request(app);
        if(full)validator.validate(app,request,true);
        Map<String,Object> variables=new LinkedHashMap<>();Map<String,String> labels=new LinkedHashMap<>();
        labels.put("amountCents","金额");labels.put("naturalDays","自然日天数");
        Long amount=app.getAmountCents();
        if(request instanceof Purchase p)amount=p.selectedQuoteIndex()==null?null:p.quotes().get(p.selectedQuoteIndex()).quoteAmountCents();
        if(request instanceof Travel t) {
            amount=t.budgetCents();TravelDetail d=travels.selectById(app.getId());variables.put("naturalDays",d.getNaturalDays());
        }
        if(request instanceof Expense e) {
            validator.validateInvoices(e,files.boundOf(app.getId()));
            long total=0;for(var item:list(e.items()))total=add(total,item.amountCents());amount=total;
        }
        if(request instanceof Custom c) {
            CustomFormData d=customs.selectById(app.getId());amount=customAmount(d);
            ProcessTemplateVersion v=versions.selectById(d.getTemplateVersionId());
            for(FormField f:v.getFormSchema().getFields()) {
                labels.put(f.getKey(),f.getLabel());JsonNode value=d.getFormValues().get(f.getKey());
                variables.put(f.getKey(),value==null||value.isNull()?null:Jsons.MAPPER.convertValue(value,Object.class));
            }
        }
        variables.put("amountCents",amount);return new BizHandler.SubmitData(amount,variables,labels);
    }

    public Object request(Application app) {
        Map<String,Object> body=new LinkedHashMap<>(view(app,true,false));body.put("title",app.getTitle());
        return switch(app.getType()) {
            case "PURCHASE" -> Jsons.convert(body,Purchase.class);case "TRAVEL" -> Jsons.convert(body,Travel.class);case "EXPENSE" -> Jsons.convert(body,Expense.class);case "CUSTOM" -> Jsons.convert(body,Custom.class);
            default -> throw new BizException(ErrorCode.BAD_REQUEST);
        };
    }

    public Map<String,Object> view(Application app, boolean attachments, boolean revealDuplicate) {
        Long id=app.getId();Map<Long,Attachment> pool=attachments?files.boundOf(id):Map.of();
        if("PURCHASE".equals(app.getType())) {
            PurchaseDetail d=purchases.selectById(id);if(d==null)return new LinkedHashMap<>();
            var qs=quotes.selectList(Wrappers.<PurchaseQuote>lambdaQuery().eq(PurchaseQuote::getApplicationId,id).orderByAsc(PurchaseQuote::getSeq));
            Map<String,Object> out=object(d);out.put("items",purchaseItems.selectList(Wrappers.<PurchaseItem>lambdaQuery().eq(PurchaseItem::getApplicationId,id).orderByAsc(PurchaseItem::getSeq))
                .stream().map(i->{var row=object(i);row.put("quantity",i.getQuantity()==null?null:i.getQuantity().toPlainString());return row;}).toList());
            Long min=qs.stream().map(PurchaseQuote::getQuoteAmountCents).filter(Objects::nonNull).min(Long::compareTo).orElse(null);
            out.put("quotes",qs.stream().map(q->{var row=object(q);row.put("attachments",files.metas(q.getAttachmentIds(),pool));row.put("lowest",q.getQuoteAmountCents()!=null&&q.getQuoteAmountCents().equals(min));return row;}).toList());
            Integer selected=null;for(int i=0;i<qs.size();i++)if(qs.get(i).getId().equals(d.getSelectedQuoteId()))selected=i;
            Long amount=selected==null?null:qs.get(selected).getQuoteAmountCents();
            out.put("selectedQuoteIndex",selected);out.put("selectedAmountCents",amount);out.put("notLowest",amount!=null&&min!=null&&amount>min);
            out.put("singleSourceAttachments",files.metas(d.getSingleSourceAttachmentIds(),pool));out.put("attachments",files.metas(d.getAttachmentIds(),pool));return out;
        }
        if("TRAVEL".equals(app.getType())) {
            TravelDetail d=travels.selectById(id);if(d==null)return new LinkedHashMap<>();var out=object(d);
            out.put("durationHours",d.getDurationHours()==null?null:d.getDurationHours().toPlainString());
            out.put("companions",companions.selectList(Wrappers.<TravelCompanion>lambdaQuery().eq(TravelCompanion::getApplicationId,id).orderByAsc(TravelCompanion::getSeq)).stream().map(c->{
                var row=object(c);var u=users.brief(c.getUserId());row.put("userName",u==null?null:u.realName());row.put("deptName",u==null?null:u.deptName());return row;}).toList());
            out.put("lateReport",d.getStartTime()!=null && app.getSubmittedAt()!=null && d.getStartTime().isBefore(app.getSubmittedAt()));out.put("attachments",files.metas(d.getAttachmentIds(),pool));return out;
        }
        if("EXPENSE".equals(app.getType())) {
            ExpenseDetail d=expenses.selectById(id);if(d==null)return new LinkedHashMap<>();var out=object(d);
            List<Map<String,Object>> rows=new ArrayList<>();int noCount=0;long noAmount=0;
            for(var item:expenseItems.selectList(Wrappers.<ExpenseItem>lambdaQuery().eq(ExpenseItem::getApplicationId,id).orderByAsc(ExpenseItem::getSeq))) {
                var row=object(item);var t=expenseTypes.selectById(item.getExpenseTypeId());row.put("expenseTypeCode",t==null?null:t.getCode());row.put("expenseTypeName",t==null?null:t.getName());
                var ivs=invoices.selectList(Wrappers.<ExpenseInvoice>lambdaQuery().eq(ExpenseInvoice::getExpenseItemId,item.getId()).orderByAsc(ExpenseInvoice::getSeq));
                row.put("invoices",ivs.stream().map(iv->{var v=map("attachmentId",iv.getAttachmentId(),"invoiceNo",iv.getInvoiceNo(),"attachment",pool.containsKey(iv.getAttachmentId())?edu.zju.eas.service.file.AttachmentMeta.of(pool.get(iv.getAttachmentId())):null);
                    var duplicate=duplicates(iv,revealDuplicate);v.put("suspectedDuplicate",!duplicate.isEmpty());v.put("duplicates",duplicate);return v;}).toList());rows.add(row);
                if(Boolean.TRUE.equals(item.getNoInvoice())){noCount++;noAmount=add(noAmount,item.getAmountCents());}
            }
            var ids=relations.selectList(Wrappers.<ExpenseRelation>lambdaQuery().eq(ExpenseRelation::getExpenseApplicationId,id)).stream().map(ExpenseRelation::getRelatedApplicationId).toList();
            out.put("items",rows);out.put("relatedApplicationIds",ids);out.put("related",ids.stream().map(applications::selectById).filter(Objects::nonNull).map(this::linked).toList());out.put("noInvoiceCount",noCount);out.put("noInvoiceAmountCents",noAmount);return out;
        }
        CustomFormData d=customs.selectById(id);if(d==null)return new LinkedHashMap<>();ProcessTemplateVersion v=versions.selectById(d.getTemplateVersionId());
        ProcessTemplate t=templates.selectById(app.getTemplateId());Map<String,Object> attached=new LinkedHashMap<>();
        for(FormField f:v.getFormSchema().getFields())if("ATTACHMENT".equals(f.getType()))attached.put(f.getKey(),files.metas(ids(d.getFormValues().get(f.getKey())),pool));
        return map("templateId",app.getTemplateId(),"templateVersionId",v.getId(),"versionNo",v.getVersionNo(),"formSchema",v.getFormSchema(),"formValues",d.getFormValues(),"attachments",attached,"outdated",!v.getId().equals(t.getCurrentVersionId()));
    }

    public Map<String,Object> linked(Application a) {
        Map<String,Object> out=map("id",a.getId(),"appNo",a.getAppNo(),"type",a.getType(),"title",a.getTitle(),"amountCents",a.getAmountCents(),"finishedAt",a.getFinishedAt());
        if("TRAVEL".equals(a.getType())){var d=travels.selectById(a.getId());out.put("travel",map("origin",d.getOrigin(),"destination",d.getDestination(),"startTime",d.getStartTime(),"endTime",d.getEndTime(),"naturalDays",d.getNaturalDays(),"budgetCents",d.getBudgetCents()));}
        if("PURCHASE".equals(a.getType())){var d=purchases.selectById(a.getId());var q=d.getSelectedQuoteId()==null?null:quotes.selectById(d.getSelectedQuoteId());out.put("purchase",map("selectedSupplier",q==null?null:q.getSupplierName(),"selectedAmountCents",a.getAmountCents(),"itemCount",purchaseItems.selectCount(Wrappers.<PurchaseItem>lambdaQuery().eq(PurchaseItem::getApplicationId,a.getId()))));}
        return out;
    }

    public List<Map<String,Object>> duplicates(ExpenseInvoice iv, boolean reveal) {
        return jdbc.query("""
            SELECT DISTINCT a.id,a.app_no,a.status FROM expense_invoice i JOIN application a ON a.id=i.application_id
            WHERE i.application_id<>? AND a.deleted_at IS NULL AND a.status IN ('IN_APPROVAL','APPROVED')
              AND (i.file_sha256=? OR (CAST(? AS varchar) IS NOT NULL AND i.invoice_no_norm=?)) ORDER BY a.id
            """,(rs,n)->map("attachmentId",iv.getAttachmentId(),"invoiceNo",iv.getInvoiceNo(),"otherApplicationId",reveal?rs.getLong("id"):null,"otherAppNo",reveal?rs.getString("app_no"):null,"otherStatus",reveal?rs.getString("status"):null),
            iv.getApplicationId(),iv.getFileSha256(),iv.getInvoiceNoNorm(),iv.getInvoiceNoNorm());
    }

    private Map<Long,String> attachmentRefs(Application app,Object request) {
        Map<Long,String> refs=new LinkedHashMap<>();
        if(request instanceof Purchase r){putRefs(refs,r.attachmentIds(),"attachmentIds");putRefs(refs,r.singleSourceAttachmentIds(),"singleSourceAttachmentIds");for(int i=0;i<list(r.quotes()).size();i++)putRefs(refs,r.quotes().get(i).attachmentIds(),"quotes["+i+"].attachmentIds");}
        if(request instanceof Travel r)putRefs(refs,r.attachmentIds(),"attachmentIds");
        if(request instanceof Expense r)for(int i=0;i<list(r.items()).size();i++)for(var iv:list(r.items().get(i).invoices()))refs.put(iv.attachmentId(),"items["+i+"].invoices");
        if(request instanceof Custom r){var v=versions.selectById(r.templateVersionId());for(FormField f:v.getFormSchema().getFields())if("ATTACHMENT".equals(f.getType()))putRefs(refs,ids(r.formValues()==null?null:r.formValues().get(f.getKey())),"formValues."+f.getKey());}
        return refs;
    }

    private Long customAmount(CustomFormData d) {
        var v=versions.selectById(d.getTemplateVersionId());
        for(FormField f:v.getFormSchema().getFields())if(f.isStatAmount()){JsonNode value=d.getFormValues().get(f.getKey());return value==null||value.isNull()?null:value.longValue();}return null;
    }
    private ExpenseType type(String code){return expenseTypes.selectOne(Wrappers.<ExpenseType>lambdaQuery().eq(ExpenseType::getCode,code));}
    static <T> List<T> list(List<T> value){return value==null?List.of():value;}
    static boolean blank(String s){return s==null||s.isBlank();}
    static String trim(String s){return blank(s)?null:s.trim();}
    static String normalizeInvoice(String s){return blank(s)?null:s.replaceAll("\\s+","").toUpperCase(Locale.ROOT);}
    static List<Long> ids(JsonNode value){if(value==null||!value.isArray())return List.of();List<Long> out=new ArrayList<>();for(JsonNode v:value)out.add(v.longValue());return out;}
    static void putRefs(Map<Long,String> out,List<Long> ids,String field){for(Long id:list(ids))out.put(id,field);}
    static Long itemAmount(String q,Long price){if(q==null||price==null)return null;try{return new BigDecimal(q).multiply(BigDecimal.valueOf(price)).setScale(0,RoundingMode.HALF_UP).longValueExact();}catch(ArithmeticException e){throw BizException.rule("items","PUR_AMOUNT_RANGE","明细金额超出范围");}}
    static long add(long a,Long b){try{long result=Math.addExact(a,b==null?0:b);if(result>9007199254740991L)throw new ArithmeticException();return result;}catch(ArithmeticException e){throw BizException.rule("amountCents","AMOUNT_RANGE","合计金额超出范围");}}
    public static Map<String,Object> map(Object... pairs){Map<String,Object> out=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)out.put((String)pairs[i],pairs[i+1]);return out;}
    static Map<String,Object> object(Object v){return Jsons.MAPPER.convertValue(v,new TypeReference<LinkedHashMap<String,Object>>(){});}
}

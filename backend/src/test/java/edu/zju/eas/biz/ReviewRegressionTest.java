package edu.zju.eas.biz;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.common.Jsons;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** 独立审查复现的复制、附件隐私和输入边界回归。 */
class ReviewRegressionTest extends IntegrationTestBase {
    @Test void copiedCustomFormDropsOnlyFieldsRejectedByCurrentRules() throws Exception {
        long file=attachment("old-source.pdf");
        var oldFields=List.of(
            field("date","DATE",map("earliest","TODAY-7")),
            map("key","choice","label","选项","type","RADIO","options",List.of(map("value","OLD","label","旧选项"))),
            field("shortText","TEXT",map("maxLength",50)),field("pattern","TEXT",null),
            field("files","ATTACHMENT",map("allowedTypes",List.of("application/pdf"))),field("keep","TEXT",null));
        long template=template(oldFields);long version=current(template);
        var values=map("date",LocalDate.now(CN).minusDays(1).toString(),"choice","OLD","shortText","previous long text","pattern","letters","files",List.of(file),"keep","保留这个值");
        long source=draft("custom","rd_emp_wang",customBody(template,version,values));
        assertEquals(200,submit(source,"rd_emp_wang").getResponse().getStatus());
        assertEquals(200,action("/applications/"+source+"/withdraw","rd_emp_wang",map("appVersion",version(source)),key()).getResponse().getStatus());
        var nextFields=List.of(
            field("date","DATE",map("earliest","TODAY")),
            map("key","choice","label","选项","type","RADIO","options",List.of(map("value","NEW","label","新选项"))),
            field("shortText","TEXT",map("maxLength",5)),field("pattern","TEXT",map("pattern","^\\d+$")),
            field("files","ATTACHMENT",map("allowedTypes",List.of("image/png"))),field("keep","TEXT",null));
        publishNext(template,nextFields);
        var copied=call(post("/applications/"+source+"/copy"),"rd_emp_wang",null);
        assertEquals(200,copied.getResponse().getStatus(),copied.getResponse().getContentAsString());
        long target=data(copied).path("id").asLong();var detail=data(call(get("/applications/"+target),"rd_emp_wang",null));
        var kept=detail.path("custom").path("formValues");assertEquals("保留这个值",kept.path("keep").asText());
        for(String key:List.of("date","choice","shortText","pattern","files"))assertFalse(kept.has(key),key);
        assertEquals(current(template),detail.path("custom").path("templateVersionId").asLong());
        assertEquals(Jsons.read(Jsons.write(values),com.fasterxml.jackson.databind.JsonNode.class),data(call(get("/applications/"+source),"rd_emp_wang",null)).path("custom").path("formValues"));
    }

    @Test void copyingTravelFiltersDisabledCompanions() throws Exception {
        var request=travelBody(10000);request.put("companions",List.of(map("userId",uid("rd_emp_chen"),"name",null)));
        long source=submitted("travel","rd_emp_wang",request);
        action("/applications/"+source+"/withdraw","rd_emp_wang",map("appVersion",version(source)),key());
        jdbc.update("UPDATE sys_user SET status='DISABLED' WHERE id=?",uid("rd_emp_chen"));authInfo.evictAll();
        var copied=call(post("/applications/"+source+"/copy"),"rd_emp_wang",null);assertEquals(200,copied.getResponse().getStatus(),copied.getResponse().getContentAsString());
        long target=data(copied).path("id").asLong();assertEquals(0,data(call(get("/applications/"+target),"rd_emp_wang",null)).path("travel").path("companions").size());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM travel_companion WHERE application_id=?",Integer.class,source));
    }

    @Test void departmentScopeDoesNotExposeAnyBusinessAttachmentMetadata() throws Exception {
        long travelFile=attachment("张三_体检报告.pdf");var travel=travelBody(10000);travel.put("attachmentIds",List.of(travelFile));
        long travelId=submitted("travel","rd_emp_wang",travel);
        long purchaseFile=attachment("敏感采购报价.pdf");var purchase=map("title","含附件采购","reason","验证附件边界","budgetLimitCents",50000,"expectedArrivalDate",LocalDate.now(CN).plusDays(2).toString(),"selectedQuoteIndex",0,
            "items",List.of(map("name","配件","unit","件","quantity","1","unitPriceCents",1000)),
            "quotes",List.of(map("supplierName","供应商甲","channel","OFFLINE","quoteAmountCents",1000,"attachmentIds",List.of(purchaseFile)),map("supplierName","供应商乙","channel","OFFLINE","quoteAmountCents",2000,"description","报价说明")),"attachmentIds",List.of(purchaseFile));
        long purchaseId=submitted("purchase","rd_emp_wang",purchase);
        long invoiceFile=attachment("个人票据.pdf");var item=expenseItem(1000);item.put("noInvoice",false);item.put("noInvoiceReason",null);item.put("invoices",List.of(map("attachmentId",invoiceFile,"invoiceNo","PRIVATE-001")));
        long expenseId=submitted("expense","rd_emp_wang",expenseBody(List.of(item)));
        long customFile=attachment("内部用印文件.pdf");long template=template(List.of(field("files","ATTACHMENT",null)));
        long customId=submitted("custom","rd_emp_wang",customBody(template,current(template),map("files",List.of(customFile))));
        // 陈工成为部门负责人，但未被分配上述任何一单的审批任务。
        jdbc.update("INSERT INTO user_role(user_id,role_id) SELECT ?,id FROM role WHERE code='DEPT_HEAD' ON CONFLICT(user_id,role_id) DO NOTHING",uid("rd_emp_chen"));
        jdbc.update("UPDATE department SET head_user_id=? WHERE code='RD'",uid("rd_emp_chen"));authInfo.evictAll();
        for(long id:List.of(travelId,purchaseId,expenseId,customId)){
            var response=call(get("/applications/"+id),"rd_emp_chen",null);assertEquals(200,response.getResponse().getStatus());
            var detail=data(response);assertFalse(detail.path("canReadAttachments").asBoolean());
            String body=detail.toString();assertFalse(body.contains("originalName"));assertFalse(body.contains("sha256"));
        }
        var travelView=data(call(get("/applications/"+travelId),"rd_emp_chen",null)).path("travel");assertEquals(0,travelView.path("attachments").size());assertEquals(0,travelView.path("attachmentIds").size());
        var purchaseView=data(call(get("/applications/"+purchaseId),"rd_emp_chen",null)).path("purchase");assertEquals(0,purchaseView.path("quotes").get(0).path("attachmentIds").size());
        assertEquals(0,data(call(get("/applications/"+expenseId),"rd_emp_chen",null)).path("expense").path("items").get(0).path("invoices").size());
        assertEquals(0,data(call(get("/applications/"+customId),"rd_emp_chen",null)).path("custom").path("formValues").path("files").size());
        assertEquals(404,call(get("/applications/"+expenseId+"/invoice-duplicates"),"rd_emp_chen",null).getResponse().getStatus());
        assertTrue(data(call(get("/applications/"+travelId),"rd_emp_wang",null)).toString().contains("张三_体检报告.pdf"));
        for(long file:List.of(travelFile,purchaseFile,invoiceFile,customFile))assertEquals(404,call(get("/files/"+file+"/content"),"rd_emp_chen",null).getResponse().getStatus());
    }

    @Test void longTravelDraftReturnsFieldErrorInsteadOfDatabaseOverflow() throws Exception {
        var body=travelBody(10000);body.put("endTime","2062-10-16T18:00:00+08:00");
        var result=call(post("/applications/travel"),"rd_emp_wang",body);assertEquals(400,result.getResponse().getStatus(),result.getResponse().getContentAsString());
        assertTrue(body(result).path("errors").toString().contains("endTime"));
    }

    @Test void defaultTextLimitsApplyBeforeBlankChecksAndRegexMatching() throws Exception {
        long template=template(List.of(field("shortText","TEXT",null),field("longText","TEXTAREA",null)));long version=current(template);
        for(String oversized:List.of("a".repeat(201)," ".repeat(201)," ".repeat(200)+"a","😀".repeat(201))){
            var result=call(post("/applications/custom"),"rd_emp_wang",customBody(template,version,map("shortText",oversized)));
            assertEquals(400,result.getResponse().getStatus());assertTrue(body(result).path("errors").toString().contains("FORM_LENGTH"));
        }
        assertEquals(400,call(post("/applications/custom"),"rd_emp_wang",customBody(template,version,map("longText","a".repeat(2001)))).getResponse().getStatus());
        assertEquals(200,call(post("/applications/custom"),"rd_emp_wang",customBody(template,version,map("shortText","a".repeat(200),"longText","a".repeat(2000)))).getResponse().getStatus());
    }

    @Test void urgeCooldownSurvivesDetailReloadWithoutDuplicateNotifications() throws Exception {
        long app=submitted("travel","rd_emp_wang",travelBody(10000));
        var first=action("/applications/"+app+"/urge","rd_emp_wang",null,key());assertEquals(200,first.getResponse().getStatus());assertTrue(data(first).path("urged").asBoolean());
        var second=action("/applications/"+app+"/urge","rd_emp_wang",null,key());assertEquals(200,second.getResponse().getStatus());assertFalse(data(second).path("urged").asBoolean());
        assertEquals(data(first).path("nextAllowedAt").asText(),data(call(get("/applications/"+app),"rd_emp_wang",null)).path("urgeNextAllowedAt").asText());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM notification WHERE application_id=? AND type='URGE'",Integer.class,app));
        assertTrue(data(call(get("/applications/"+app),"rd_head_li",null)).path("urgeNextAllowedAt").isNull());
    }

    private long attachment(String name){return jdbc.queryForObject("INSERT INTO attachment(uploader_id,ref_type,original_name,storage_key,content_type,size_bytes,sha256,status) VALUES (?,'CUSTOM_FIELD',?,?,'application/pdf',100,?,'TEMP') RETURNING id",Long.class,uid("rd_emp_wang"),name,UUID.randomUUID().toString(),"a".repeat(64));}
    private Map<String,Object> field(String key,String type,Object rules){return map("key",key,"label",key,"type",type,"rules",rules);}
    private Map<String,Object> customBody(long template,long version,Map<String,Object> values){return map("templateId",template,"templateVersionId",version,"title","审查回归自定义","formValues",values);}
    private long current(long template){return jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id=?",Long.class,template);}
    private long template(List<?> fields){
        long id=jdbc.queryForObject("INSERT INTO process_template(code,name,category,biz_type,enabled) VALUES (?,?,'CUSTOM','CUSTOM',true) RETURNING id",Long.class,"REVIEW_"+UUID.randomUUID().toString().replace("-",""),"审查回归模板");
        var config=map("nodes",List.of(map("nodeKey","N1","name","部门审核","approverRule",map("type","SPECIFIED_USER","userId",uid("rd_head_li"))),map("nodeKey","N2","name","最终审核","approverRule",map("type","SPECIFIED_USER","userId",uid("ceo_zhao")))));
        long version=jdbc.queryForObject("INSERT INTO process_template_version(template_id,version_no,status,form_schema,node_config,published_at) VALUES (?,1,'PUBLISHED',?::jsonb,?::jsonb,now()) RETURNING id",Long.class,id,Jsons.write(map("fields",fields)),Jsons.write(config));
        jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?",version,id);return id;
    }
    private void publishNext(long template,List<?> fields){
        long previous=current(template);jdbc.update("UPDATE process_template_version SET status='ARCHIVED' WHERE id=?",previous);
        long version=jdbc.queryForObject("INSERT INTO process_template_version(template_id,version_no,status,form_schema,node_config,published_at) SELECT template_id,version_no+1,'PUBLISHED',?::jsonb,node_config,now() FROM process_template_version WHERE id=? RETURNING id",Long.class,Jsons.write(map("fields",fields)),previous);
        jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?",version,template);
    }
}

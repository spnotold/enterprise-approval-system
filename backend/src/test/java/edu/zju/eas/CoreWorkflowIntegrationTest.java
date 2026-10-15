package edu.zju.eas;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.repository.*;
import edu.zju.eas.security.*;
import edu.zju.eas.service.file.StorageService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import static edu.zju.eas.service.app.BusinessDataService.map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** 指向独立 PostgreSQL 测试库运行；不触碰本地开发库或 Docker 中的业务数据。 */
@SpringBootTest
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@EnabledIfEnvironmentVariable(named="EAS_TEST_DB_URL",matches=".+")
class CoreWorkflowIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p){
        p.add("spring.datasource.url",()->System.getenv("EAS_TEST_DB_URL"));
        p.add("spring.datasource.username",()->System.getenv().getOrDefault("EAS_TEST_DB_USER","eas_test"));
        p.add("spring.datasource.password",()->System.getenv().getOrDefault("EAS_TEST_DB_PASSWORD",""));
        p.add("spring.flyway.user",()->System.getenv().getOrDefault("EAS_TEST_DB_USER","eas_test"));
        p.add("spring.flyway.password",()->System.getenv().getOrDefault("EAS_TEST_DB_PASSWORD",""));
        p.add("eas.jwt.secret",()->"test-secret-for-integration-tests-only-32b");
        p.add("eas.minio.secret-key",()->"integration-test-key");
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TokenService tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired AuthInfoService auth;
    @MockBean StorageService storage;
    long employee,head,finance,enterprise,stranger,admin;

    @BeforeAll void setup(){
        String prefix="it"+UUID.randomUUID().toString().replace("-","").substring(0,8);
        employee=user(prefix+"emp",1,"EMPLOYEE");head=user(prefix+"head",1,"DEPT_HEAD");
        finance=user(prefix+"fin",2,"FINANCE_APPROVER");enterprise=user(prefix+"boss",3,"ENTERPRISE_HEAD");
        stranger=user(prefix+"other",2,"EMPLOYEE");admin=user(prefix+"admin",4,"SYS_ADMIN");
        jdbc.update("UPDATE department SET head_user_id=? WHERE id=1",head);
        jdbc.update("UPDATE department SET head_user_id=? WHERE id=2",finance);
        jdbc.update("UPDATE department SET head_user_id=? WHERE id=3",enterprise);
        jdbc.update("UPDATE user_role SET is_primary_handler=false WHERE role_id IN (3,4)");
        jdbc.update("UPDATE user_role SET is_primary_handler=true WHERE user_id IN (?,?)",finance,enterprise);
        jdbc.update("UPDATE sys_config SET config_value='false' WHERE config_key='mail.enabled'");
        auth.evictAll();
    }

    @Test void incompleteDraftSavesAndRejectsStaleVersion()throws Exception{
        JsonNode draft=data(call(post("/applications/travel"),employee,map("title","半份草稿")));
        long id=draft.path("id").asLong();assertEquals(0,draft.path("version").asInt());
        MvcResult saved=call(put("/applications/"+id+"/travel"),employee,map("version",0,"title",null));assertEquals(200,saved.getResponse().getStatus());
        assertEquals(409,call(put("/applications/"+id+"/travel"),employee,map("version",0,"title","旧版本")).getResponse().getStatus());
        assertEquals(422,action("/applications/"+id+"/submit",employee,1,"submit-missing-fields").getResponse().getStatus());
        assertEquals("DRAFT",jdbc.queryForObject("SELECT status FROM application WHERE id=?",String.class,id));
    }

    @Test void submitApproveReplayAndPermissions()throws Exception{
        long id=createTravel(employee,10000);assertEquals(404,call(get("/applications/"+id),stranger,null).getResponse().getStatus());
        assertEquals(404,call(get("/applications/"+id),head,null).getResponse().getStatus());
        MvcResult first=action("/applications/"+id+"/submit",employee,0,"submit-idem-key-"+id);assertEquals(200,first.getResponse().getStatus(),first.getResponse().getContentAsString());
        MvcResult replay=action("/applications/"+id+"/submit",employee,0,"submit-idem-key-"+id);assertEquals(first.getResponse().getContentAsString(),replay.getResponse().getContentAsString());
        assertNull(first.getResponse().getHeader("Idempotent-Replayed"));assertEquals("true",replay.getResponse().getHeader("Idempotent-Replayed"));
        assertTrue(data(call(get("/tasks/pending-count"),head,null)).path("count").asInt()>=1);
        assertTrue(data(call(get("/applications?scope=mine&from=2000-01-01&to=2999-12-31"),employee,null)).path("total").asInt()>=1);
        assertEquals(409,action("/applications/"+id+"/submit",employee,1,"submit-idem-key-"+id).getResponse().getStatus());
        assertEquals(404,call(get("/applications/"+id),admin,null).getResponse().getStatus());
        long task=pending(id,head);
        assertEquals(403,action("/tasks/"+task+"/approve",stranger,1,"wrong-user-key-"+id).getResponse().getStatus());
        MvcResult approved=action("/tasks/"+task+"/approve",head,1,"approve-key-"+id);assertEquals(200,approved.getResponse().getStatus(),approved.getResponse().getContentAsString());
        assertEquals("APPROVED",data(approved).path("status").asText());
        assertNull(jdbc.queryForObject("SELECT current_node_seq FROM application WHERE id=?",Integer.class,id));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM approval_log WHERE task_id=? AND action='APPROVE'",Integer.class,task));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM approval_task WHERE application_id=? AND status='PENDING'",Integer.class,id));
    }

    @Test void concurrentApproveAndWithdrawHaveOneWinner()throws Exception{
        long id=createTravel(employee,10000);assertEquals(200,action("/applications/"+id+"/submit",employee,0,"race-submit-"+id).getResponse().getStatus());long task=pending(id,head);
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            Future<Integer> approve=pool.submit(()->{start.await();return action("/tasks/"+task+"/approve",head,1,"race-approve-"+id).getResponse().getStatus();});
            Future<Integer> withdraw=pool.submit(()->{start.await();return action("/applications/"+id+"/withdraw",employee,1,"race-withdraw-"+id).getResponse().getStatus();});start.countDown();
            List<Integer> results=List.of(approve.get(15,TimeUnit.SECONDS),withdraw.get(15,TimeUnit.SECONDS));assertEquals(1,Collections.frequency(results,200),results.toString());assertEquals(1,Collections.frequency(results,409),results.toString());
            assertNull(jdbc.queryForObject("SELECT current_node_seq FROM application WHERE id=?",Integer.class,id));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM approval_task WHERE application_id=? AND status='PENDING'",Integer.class,id));
        }finally{pool.shutdownNow();}
    }

    @Test void highBudgetTravelActivatesSecondNodeAndKeepsSubmitDepartment()throws Exception{
        long id=createTravel(employee,2000000);assertEquals(200,action("/applications/"+id+"/submit",employee,0,"high-submit-"+id).getResponse().getStatus());
        jdbc.update("UPDATE sys_user SET dept_id=2 WHERE id=?",employee);auth.evict(employee);
        try{assertEquals(200,action("/tasks/"+pending(id,head)+"/approve",head,1,"high-head-"+id).getResponse().getStatus());
            assertEquals("IN_APPROVAL",jdbc.queryForObject("SELECT status FROM application WHERE id=?",String.class,id));assertTrue(pending(id,enterprise)>0);
            assertEquals(1,jdbc.queryForObject("SELECT dept_id FROM application WHERE id=?",Integer.class,id));
            assertEquals(200,action("/tasks/"+pending(id,enterprise)+"/approve",enterprise,2,"high-boss-"+id).getResponse().getStatus());
        }finally{jdbc.update("UPDATE sys_user SET dept_id=1 WHERE id=?",employee);auth.evict(employee);}
    }

    @Test void copiedRejectedApplicationStartsNewDraftAndKeepsHistory()throws Exception{
        long id=createTravel(employee,10000);action("/applications/"+id+"/submit",employee,0,"reject-submit-"+id);
        long task=pending(id,head);assertEquals(200,call(post("/tasks/"+task+"/reject").header("Idempotency-Key","reject-key-"+id),head,map("appVersion",1,"comment","请补充出差具体安排")).getResponse().getStatus());
        MvcResult copied=call(post("/applications/"+id+"/copy"),employee,null);assertEquals(200,copied.getResponse().getStatus(),copied.getResponse().getContentAsString());
        long target=data(copied).path("id").asLong();assertNotEquals(id,target);assertEquals("DRAFT",jdbc.queryForObject("SELECT status FROM application WHERE id=?",String.class,target));
        assertEquals(id,jdbc.queryForObject("SELECT source_application_id FROM application WHERE id=?",Long.class,target));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM flow_instance WHERE application_id=?",Integer.class,target));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM approval_log WHERE application_id=?",Integer.class,id));
    }

    @Test void purchaseTotalAndMultiStageApproval()throws Exception{
        var body=map("title","测试采购","reason","设备采购测试","budgetLimitCents",20000,"expectedArrivalDate",java.time.LocalDate.now().plusDays(2).toString(),"singleSource",false,"selectedQuoteIndex",0,
            "items",List.of(map("name","配件","unit","件","quantity","1.235","unitPriceCents",100)),
            "quotes",List.of(map("supplierName","供应商A","channel","OFFLINE","quoteAmountCents",10000,"description","报价说明"),map("supplierName","供应商B","channel","OFFLINE","quoteAmountCents",12000,"description","报价说明")));
        MvcResult created=call(post("/applications/purchase"),employee,body);assertEquals(200,created.getResponse().getStatus(),created.getResponse().getContentAsString());long id=data(created).path("id").asLong();
        assertEquals(124,jdbc.queryForObject("SELECT items_total_cents FROM purchase_detail WHERE application_id=?",Long.class,id));
        assertEquals(10000,jdbc.queryForObject("SELECT amount_cents FROM application WHERE id=?",Long.class,id));
        assertEquals(200,action("/applications/"+id+"/submit",employee,0,"purchase-submit-"+id).getResponse().getStatus());
        assertEquals(200,action("/tasks/"+pending(id,head)+"/approve",head,1,"purchase-head-"+id).getResponse().getStatus());
        assertEquals(200,action("/tasks/"+pending(id,finance)+"/approve",finance,2,"purchase-fin-"+id).getResponse().getStatus());
        assertEquals("APPROVED",jdbc.queryForObject("SELECT status FROM application WHERE id=?",String.class,id));
    }

    @Test void linkedSummaryDoesNotRevealOriginalAttachmentsOrComments()throws Exception{
        long travel=createTravel(employee,10000);action("/applications/"+travel+"/submit",employee,0,"linked-submit-"+travel);action("/tasks/"+pending(travel,head)+"/approve",head,1,"linked-approve-"+travel);
        var body=map("title","独立测试报销","relatedApplicationIds",List.of(travel),"items",List.of(map("expenseTypeCode","TRANSPORT","occurDate",java.time.LocalDate.now().toString(),"purpose","交通费","amountCents",1000,"noInvoice",true,"noInvoiceReason","票据遗失无法提供原始票据")));
        MvcResult created=call(post("/applications/expense"),employee,body);assertEquals(200,created.getResponse().getStatus(),created.getResponse().getContentAsString());long expense=data(created).path("id").asLong();
        MvcResult submitted=action("/applications/"+expense+"/submit",employee,0,"expense-linked-"+expense);assertEquals(200,submitted.getResponse().getStatus(),submitted.getResponse().getContentAsString());
        // 财务只有报销节点的待办后才能通过其关联关系读取原单摘要。
        assertEquals(200,action("/tasks/"+pending(expense,head)+"/approve",head,1,"expense-head-"+expense).getResponse().getStatus());
        MvcResult linked=call(get("/applications/"+travel),finance,null);assertEquals(200,linked.getResponse().getStatus(),linked.getResponse().getContentAsString());JsonNode detail=data(linked);
        assertEquals("LINKED",detail.path("viewMode").asText());assertFalse(detail.path("canReadAttachments").asBoolean());assertTrue(detail.path("travel").isNull());assertEquals(0,detail.path("logs").size());assertFalse(detail.path("linked").isNull());
        assertEquals(404,call(get("/applications/"+travel+"/logs"),finance,null).getResponse().getStatus());
    }

    @Test void paginationCountsOnlyAuthorizedRowsAndAdminCannotCreate()throws Exception{
        long id=createTravel(employee,10000);JsonNode mine=data(call(get("/applications").param("scope","mine"),employee,null));assertTrue(mine.path("records").isArray());
        assertEquals(403,call(get("/applications").param("scope","dept"),stranger,null).getResponse().getStatus());
        assertEquals(403,call(post("/applications/travel"),admin,map("title","不得新建")).getResponse().getStatus());
        assertEquals(400,call(get("/applications").param("size","101"),employee,null).getResponse().getStatus());
        assertEquals(400,call(post("/applications/"+id+"/submit"),employee,map("appVersion",0)).getResponse().getStatus());
    }

    @Test void countersignRequiresBothApprovalsAndReplayDoesNotIncrement()throws Exception{
        long template=customTemplate("COUNTERSIGN");long id=createCustom(template);action("/applications/"+id+"/submit",employee,0,"counter-submit-"+id);
        long h=pending(id,head),f=pending(id,finance);MvcResult first=action("/tasks/"+h+"/approve",head,1,"counter-head-"+id);assertEquals(200,first.getResponse().getStatus(),first.getResponse().getContentAsString());
        assertEquals(first.getResponse().getContentAsString(),action("/tasks/"+h+"/approve",head,1,"counter-head-"+id).getResponse().getContentAsString());
        assertEquals(1,jdbc.queryForObject("SELECT version FROM application WHERE id=?",Integer.class,id));
        assertEquals(1,jdbc.queryForObject("SELECT approved_count FROM flow_node_instance WHERE application_id=? AND seq=1",Integer.class,id));
        assertEquals(200,action("/tasks/"+f+"/approve",finance,1,"counter-finance-"+id).getResponse().getStatus());
        assertTrue(pending(id,enterprise)>0);assertEquals(2,jdbc.queryForObject("SELECT version FROM application WHERE id=?",Integer.class,id));
    }

    @Test void orSignCancelsOtherTaskAndMovesExactlyOnce()throws Exception{
        long id=createCustom(customTemplate("OR_SIGN"));action("/applications/"+id+"/submit",employee,0,"or-submit-"+id);long h=pending(id,head),f=pending(id,finance);
        assertEquals(200,action("/tasks/"+h+"/approve",head,1,"or-head-"+id).getResponse().getStatus());
        assertEquals("CANCELED",jdbc.queryForObject("SELECT status FROM approval_task WHERE id=?",String.class,f));
        assertEquals(409,action("/tasks/"+f+"/approve",finance,1,"or-finance-"+id).getResponse().getStatus());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM approval_task WHERE application_id=? AND status='PENDING'",Integer.class,id));
        assertTrue(pending(id,enterprise)>0);
    }

    @Test void customSchemaAndPublishedVersionAreEnforced()throws Exception{
        long template=customTemplate("COUNTERSIGN");long version=jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id=?",Long.class,template);
        MvcResult invalid=call(post("/applications/custom"),employee,map("templateId",template,"templateVersionId",version,"title","非法字段","formValues",map("amount",100,"injected",true)));assertEquals(400,invalid.getResponse().getStatus());
        long id=createCustom(template);
        assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE process_template_version SET form_schema='{}'::jsonb WHERE id=?",version));
        Long next=jdbc.queryForObject("INSERT INTO process_template_version(template_id,version_no,status,form_schema,node_config) SELECT template_id,2,'DRAFT',form_schema,node_config FROM process_template_version WHERE id=? RETURNING id",Long.class,version);
        jdbc.update("UPDATE process_template_version SET status='ARCHIVED' WHERE id=?",version);jdbc.update("UPDATE process_template_version SET status='PUBLISHED',published_at=now() WHERE id=?",next);jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?",next,template);
        MvcResult old=action("/applications/"+id+"/submit",employee,0,"stale-template-"+id);assertEquals(409,old.getResponse().getStatus());assertEquals(40906,Jsons.read(old.getResponse().getContentAsString(),JsonNode.class).path("code").asInt());
        assertEquals("DRAFT",jdbc.queryForObject("SELECT status FROM application WHERE id=?",String.class,id));
    }

    @Test void departmentBodyAccessDoesNotGrantAttachmentAccess()throws Exception{
        long id=createCustom(customTemplate("OR_SIGN"));action("/applications/"+id+"/submit",employee,0,"file-scope-"+id);
        Long viewer=jdbc.queryForObject("INSERT INTO sys_user(username,real_name,email,password_hash,dept_id,status) VALUES (?,?,?, ?,1,'ACTIVE') RETURNING id",Long.class,"viewer"+id,"部门观察员","viewer"+id+"@example.test",passwords.encode("Integration123!"));
        jdbc.update("INSERT INTO user_role(user_id,role_id) VALUES (?,2)",viewer);
        jdbc.update("UPDATE department SET head_user_id=? WHERE id=1",viewer);auth.evict(viewer);
        try{
            Long file=jdbc.queryForObject("INSERT INTO attachment(uploader_id,application_id,ref_type,original_name,storage_key,content_type,size_bytes,sha256,status) VALUES (?,?,'CUSTOM_FIELD','x.pdf',?,'application/pdf',100,?,'BOUND') RETURNING id",Long.class,employee,id,"test-"+id,"a".repeat(64));
            MvcResult detail=call(get("/applications/"+id),viewer,null);assertEquals(200,detail.getResponse().getStatus());assertFalse(data(detail).path("canReadAttachments").asBoolean());
            assertEquals(404,call(get("/files/"+file+"/content"),viewer,null).getResponse().getStatus());
        }finally{jdbc.update("UPDATE department SET head_user_id=? WHERE id=1",head);auth.evict(viewer);}
    }

    @Test void simultaneousAttachmentBindingHasOneOwner()throws Exception{
        Long file=jdbc.queryForObject("INSERT INTO attachment(uploader_id,ref_type,original_name,storage_key,content_type,size_bytes,sha256,status) VALUES (?,'TRAVEL_ATTACHMENT','x.png',?,'image/png',100,?,'TEMP') RETURNING id",Long.class,employee,"temp-"+UUID.randomUUID(),"b".repeat(64));
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            Callable<Integer> bind=()->{start.await();return call(post("/applications/travel"),employee,map("title","同时绑定","attachmentIds",List.of(file))).getResponse().getStatus();};
            Future<Integer> first=pool.submit(bind),second=pool.submit(bind);start.countDown();List<Integer> results=List.of(first.get(15,TimeUnit.SECONDS),second.get(15,TimeUnit.SECONDS));
            assertEquals(1,Collections.frequency(results,200),results.toString());assertNotNull(jdbc.queryForObject("SELECT application_id FROM attachment WHERE id=?",Long.class,file));
        }finally{pool.shutdownNow();}
    }

    private long customTemplate(String mode){
        Long template=jdbc.queryForObject("INSERT INTO process_template(code,name,category,biz_type,enabled) VALUES (?,?,'CUSTOM','CUSTOM',true) RETURNING id",Long.class,"IT_"+UUID.randomUUID().toString().replace("-","").substring(0,20),"测试自定义");
        var schema=map("fields",List.of(map("key","amount","label","金额","type","AMOUNT","required",true,"statAmount",true)));
        var nodes=map("nodes",List.of(map("nodeKey","N1","name","多人审批","mode",mode,"approverRule",map("type","SPECIFIED_USER","userIds",List.of(head,finance))),map("nodeKey","N2","name","最终审批","approverRule",map("type","SPECIFIED_USER","userId",enterprise))));
        Long version=jdbc.queryForObject("INSERT INTO process_template_version(template_id,version_no,status,form_schema,node_config,published_at) VALUES (?,1,'PUBLISHED',?::jsonb,?::jsonb,now()) RETURNING id",Long.class,template,Jsons.write(schema),Jsons.write(nodes));
        jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?",version,template);return template;
    }
    private long createCustom(long template)throws Exception{Long version=jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id=?",Long.class,template);MvcResult result=call(post("/applications/custom"),employee,map("templateId",template,"templateVersionId",version,"title","自定义流程","formValues",map("amount",1000)));assertEquals(200,result.getResponse().getStatus(),result.getResponse().getContentAsString());return data(result).path("id").asLong();}

    private long user(String name,int dept,String role){Long id=jdbc.queryForObject("INSERT INTO sys_user(username,real_name,email,password_hash,dept_id,status) VALUES (?,?,?,?,?,'ACTIVE') RETURNING id",Long.class,name,name,name+"@example.test",passwords.encode("Integration123!"),dept);jdbc.update("INSERT INTO user_role(user_id,role_id) SELECT ?,id FROM role WHERE code=?",id,role);return id;}
    private long createTravel(long user,long amount)throws Exception{OffsetDateTime start=OffsetDateTime.now().plusDays(1).withHour(18).withMinute(0).withSecond(0).withNano(0);MvcResult result=call(post("/applications/travel"),user,map("title","业务闭环测试","origin","杭州","destination","上海","startTime",start.toString(),"endTime",start.plusHours(15).toString(),"transport","TRAIN","purpose","客户交流","budgetCents",amount));assertEquals(200,result.getResponse().getStatus(),result.getResponse().getContentAsString());return data(result).path("id").asLong();}
    private long pending(long app,long assignee){return jdbc.queryForObject("SELECT id FROM approval_task WHERE application_id=? AND assignee_id=? AND status='PENDING'",Long.class,app,assignee);}
    private MvcResult action(String path,long user,int version,String key)throws Exception{return call(post(path).header("Idempotency-Key",key),user,map("appVersion",version));}
    private MvcResult call(MockHttpServletRequestBuilder request,long user,Object body)throws Exception{request.header("Authorization","Bearer "+tokens.issueAccess(user,0));if(body!=null)request.contentType("application/json").content(Jsons.write(body));return mvc.perform(request).andReturn();}
    private JsonNode data(MvcResult result)throws Exception{JsonNode response=Jsons.read(result.getResponse().getContentAsString(),JsonNode.class);assertEquals(0,response.path("code").asInt(),response.toString());return response.path("data");}
}

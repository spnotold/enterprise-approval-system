package edu.zju.eas.admin;

import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import edu.zju.eas.TestDatabase;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.controller.admin.*;
import edu.zju.eas.controller.stats.StatsController;
import edu.zju.eas.controller.template.TemplateController;
import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.dto.template.TemplateDtos.*;
import edu.zju.eas.model.template.*;
import edu.zju.eas.repository.*;
import edu.zju.eas.response.*;
import edu.zju.eas.security.*;
import edu.zju.eas.service.*;
import edu.zju.eas.service.admin.*;
import edu.zju.eas.service.notify.NotificationService;
import edu.zju.eas.service.stats.StatsService;
import edu.zju.eas.service.template.*;
import org.apache.ibatis.session.SqlSessionFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 真实 PostgreSQL 的约束、JSONB、聚合与事务测试；不启动其他代理负责的应用模块。
 * 在独立的临时库上运行（服务器来源见 {@link TestDatabase}），不接触原有业务数据。
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdminTemplateStatsTest {
    private static DataSource source;
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private String databaseUrl;
    private TemplateService templates;
    private UserAdminService users;
    private DepartmentAdminService departments;
    private GrantAdminService grants;
    private ConfigAdminService config;
    private StatsService stats;
    private MockMvc mvc;

    @BeforeAll void start() throws Exception {
        databaseUrl=TestDatabase.createDatabase("eas_module_test");
        source=new DriverManagerDataSource(databaseUrl,TestDatabase.user(),TestDatabase.password());
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        context=new AnnotationConfigApplicationContext(TestConfig.class);jdbc=context.getBean(JdbcTemplate.class);
        templates=context.getBean(TemplateService.class);users=context.getBean(UserAdminService.class);
        departments=context.getBean(DepartmentAdminService.class);grants=context.getBean(GrantAdminService.class);
        config=context.getBean(ConfigAdminService.class);stats=context.getBean(StatsService.class);
        mvc=MockMvcBuilders.standaloneSetup(new TemplateAdminController(templates),new TemplateController(templates),new StatsController(stats))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @AfterAll void stop() {
        SecurityContextHolder.clearContext();
        if(context!=null) context.close();
        if(databaseUrl!=null) TestDatabase.dropDatabase(databaseUrl);
    }

    @BeforeEach void reset() {
        List<String> tables=jdbc.queryForList("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history'",String.class);
        jdbc.execute("TRUNCATE "+String.join(",",tables)+" RESTART IDENTITY CASCADE");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V3__seed_base.sql"),new ClassPathResource("db/migration/V4__seed_builtin_templates.sql")).execute(source);
        for(int i=1;i<=6;i++) jdbc.update("INSERT INTO sys_user(id,username,real_name,email,password_hash,dept_id,status) OVERRIDING SYSTEM VALUE VALUES(?,?,?,?,?,?,'ACTIVE')",
                i,"user"+i,"用户"+i,"u"+i+"@example.test","unused",i==1 || i==6?4:i==4?3:i==5?2:1);
        jdbc.execute("SELECT setval(pg_get_serial_sequence('sys_user','id'),6)");
        jdbc.update("INSERT INTO user_role(user_id,role_id) VALUES(1,5),(6,5),(2,1),(3,1),(4,1),(5,1),(3,2),(4,2),(5,2)");
        jdbc.update("INSERT INTO user_role(user_id,role_id,is_primary_handler) VALUES(4,3,true),(3,4,true)");
        jdbc.update("UPDATE department SET head_user_id=CASE id WHEN 1 THEN 3 WHEN 2 THEN 5 WHEN 3 THEN 4 ELSE 3 END");
        context.getBean(AuthInfoService.class).evictAll();context.getBean(SysConfigService.class).evict();as(1);
    }

    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}
    private void as(long uid) {
        var u=context.getBean(AuthInfoService.class).get(uid).user();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(u,"",List.of()));
    }
    private Draft draft(String label) {
        return new Draft(Jsons.read("{\"fields\":[{\"key\":\"purpose\",\"label\":\"事由\",\"type\":\"TEXT\",\"required\":true}]}",FormSchema.class),
                Jsons.read("{\"nodes\":[{\"nodeKey\":\"N1\",\"name\":\""+label+"\",\"approverRule\":{\"type\":\"SPECIFIED_USER\",\"userId\":3}},{\"nodeKey\":\"N2\",\"name\":\"复核\",\"approverRule\":{\"type\":\"ROLE\",\"roleCode\":\"FINANCE_APPROVER\"}}]}",NodeConfig.class));
    }
    private long custom() {return templates.create(new Create("CUSTOM_TEST","测试模板",null,List.of(1L))).id();}

    @Test void publicationPreservesOldVersionsAndEmployeeScope() {
        long id=custom();templates.saveDraft(id,draft("初审"));assertThat(templates.validate(id)).isEmpty();
        var first=templates.publish(id,"首次上线");long old=first.published().id();
        jdbc.update("INSERT INTO application(app_no,type,template_id,template_version_id,applicant_id,dept_id,status,submitted_at) VALUES('CUSTOM_USAGE','CUSTOM',?,?,2,1,'IN_APPROVAL',now())",id,old);
        templates.setEnabled(id,true,"开放使用");as(2);
        assertThat(templates.current(id).versionId()).isEqualTo(old);
        assertThat(templates.available()).extracting(Option::id).contains(id);
        as(5);assertThatThrownBy(()->templates.current(id)).isInstanceOf(BizException.class).extracting(e->((BizException)e).errorCode()).isEqualTo(ErrorCode.NOT_FOUND);
        as(1);var draft=templates.createDraft(id);assertThat(templates.createDraft(id).id()).isEqualTo(draft.id());
        templates.saveDraft(id,draft("调整后的初审"));templates.publish(id,"调整审批节点");
        var after=templates.get(id);
        assertThat(after.currentVersionNo()).isEqualTo(2);assertThat(after.hasDraft()).isFalse();
        assertThat(after.versions()).extracting(VersionBrief::status).containsExactly("PUBLISHED","ARCHIVED");
        assertThat(after.usageCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT template_version_id FROM application WHERE app_no='CUSTOM_USAGE'",Long.class)).isEqualTo(old);
        assertThat(jdbc.queryForObject("SELECT node_config->'nodes'->0->>'name' FROM process_template_version WHERE id=?",String.class,old)).isEqualTo("初审");
        assertThatThrownBy(()->jdbc.update("UPDATE process_template_version SET form_schema='{}'::jsonb WHERE id=?",old)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("DELETE FROM process_template_version WHERE id=?",old)).isInstanceOf(DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action='TEMPLATE_PUBLISH' AND reason IS NOT NULL",Long.class)).isEqualTo(2);
    }

    @Test void validationCollectsMalformedFieldsNodesAndApproversWithoutChangingPublication() throws Exception {
        long id=custom();
        FormSchema schema=Jsons.read("""
                {"fields":[{"key":"days","label":"天数","type":"NUMBER","rules":{"min":"9","max":"1"}},
                {"key":"DAYS","label":"重复","type":"AMOUNT","statAmount":true},
                {"key":"missingType","label":"类型缺失"},{"key":"end","label":"截止","type":"DATE","rules":{"notBefore":"unknown"}}]}
                """,FormSchema.class);
        NodeConfig nodes=Jsons.read("""
                {"nodes":[{"nodeKey":"N1","name":"管理员","approverRule":{"type":"SPECIFIED_USER","userId":1},
                "condition":{"rules":[{"var":"days","value":"1"}]}},
                {"nodeKey":"N1","name":"不存在","approverRule":{"type":"ROLE","roleCode":"SYS_ADMIN"},
                "condition":{"rules":[{"var":"unknown","op":"EQ","value":"1"}]}}]}
                """,NodeConfig.class);
        templates.saveDraft(id,new Draft(schema,nodes));
        assertThat(templates.validate(id)).extracting(ValidationIssue::code).contains("TPL_FIELD_INVALID","TPL_FIELD_KEY_DUP","TPL_APPROVER_INVALID","TPL_NODE_INCOMPLETE","TPL_CONDITION_REF","TPL_CYCLE","TPL_ALL_SKIPPABLE");
        mvc.perform(post("/admin/templates/{id}/publish",id).contentType("application/json").content("{\"changeNote\":\"非法配置\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value(42201)).andExpect(jsonPath("$.errors[0].field").isString());
        assertThat(templates.get(id).published()).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action='TEMPLATE_PUBLISH'",Long.class)).isZero();
    }

    @Test void builtinsCannotChangeFormAndDraftCreationIsSerialized() throws Exception {
        templates.createDraft(1L);
        assertThatThrownBy(()->templates.saveDraft(1L,draft("越界"))).isInstanceOf(BizException.class);
        long id=custom();templates.saveDraft(id,draft("初审"));templates.publish(id,"首次发布");
        ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
        try {
            List<Future<Long>> futures=new ArrayList<>();
            for(int i=0;i<2;i++) futures.add(pool.submit(()->{as(1);start.await();try{return templates.createDraft(id).id();}finally{clearSecurity();}}));
            start.countDown();assertThat(futures.get(0).get(10,TimeUnit.SECONDS)).isEqualTo(futures.get(1).get(10,TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM process_template_version WHERE template_id=? AND status='DRAFT'",Long.class,id)).isEqualTo(1);
        } finally {pool.shutdownNow();}
    }

    @Test void publicationRejectsApproversWithoutTaskPermissionAndOverlongNodeKeys() {
        long id=custom();Draft valid=draft("初审");
        valid.nodeConfig().getNodes().get(0).setNodeKey("N".repeat(33));
        templates.saveDraft(id,valid);
        assertThat(templates.validate(id)).extracting(ValidationIssue::code).contains("TPL_CYCLE");
        valid.nodeConfig().getNodes().get(0).setNodeKey("N1");
        jdbc.update("DELETE FROM user_role WHERE user_id=3");
        templates.saveDraft(id,valid);
        assertThat(templates.validate(id)).extracting(ValidationIssue::code).contains("TPL_APPROVER_INVALID");
        assertThatThrownBy(()->config.update(SysConfigService.FALLBACK_APPROVER,new ConfigSave("USER:3","无审批权限人员"))).isInstanceOf(BizException.class);
    }

    @Test void failedAuditRollsBackEntirePublication() {
        long id=custom();templates.saveDraft(id,draft("初审"));
        jdbc.execute("ALTER TABLE audit_log ADD CONSTRAINT test_audit_failure CHECK(action<>'TEMPLATE_PUBLISH')");
        try {
            assertThatThrownBy(()->templates.publish(id,"审计故障时必须回滚")).isInstanceOf(DataAccessException.class);
            assertThat(templates.get(id).published()).isNull();assertThat(templates.get(id).draft().status()).isEqualTo("DRAFT");
        } finally {jdbc.execute("ALTER TABLE audit_log DROP CONSTRAINT test_audit_failure");}
        assertThat(templates.publish(id,"恢复后发布").published().status()).isEqualTo("PUBLISHED");
    }

    @Test void concurrentDisablingCannotRemoveBothAdministrators() throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
        try {
            List<Future<Boolean>> futures=new ArrayList<>();
            for(long target:List.of(1L,6L)) futures.add(pool.submit(()->{
                as(1);start.await();try {users.change(target,"DISABLE",null,null,"并发停用测试");return true;}
                catch(BizException e){return false;}finally{clearSecurity();}
            }));
            start.countDown();assertThat(List.of(futures.get(0).get(10,TimeUnit.SECONDS),futures.get(1).get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM sys_user WHERE id IN(1,6) AND status='ACTIVE'",Long.class)).isEqualTo(1);
        } finally {pool.shutdownNow();}
    }

    @Test void administrationChecksLastAdminAndSynchronizesHeadRolesAndRegistration() {
        users.change(6L,"DISABLE",null,null,"停用备用账号");
        assertThatThrownBy(()->users.change(1L,"DISABLE",null,null,"尝试停用最后管理员")).isInstanceOf(BizException.class);
        assertThatThrownBy(()->users.change(1L,"REVOKE_ROLE",null,"SYS_ADMIN","回收最后管理员")).isInstanceOf(BizException.class);
        assertThat(users.get(1L).status()).isEqualTo("ACTIVE");
        departments.setHead(1L,new SetHead(2L,"调整负责人"));
        assertThat(users.get(2L).roles()).extracting(RoleBrief::code).contains("DEPT_HEAD");
        assertThat(users.get(3L).roles()).extracting(RoleBrief::code).contains("DEPT_HEAD");
        departments.setHead(4L,new SetHead(null,"清除另一部门负责人"));
        assertThat(users.get(3L).roles()).extracting(RoleBrief::code).doesNotContain("DEPT_HEAD");
        long pending=jdbc.queryForObject("INSERT INTO sys_user(username,real_name,email,password_hash,requested_dept_id) VALUES('pending','待审核','pending@example.test','unused',1) RETURNING id",Long.class);
        var approved=users.change(pending,"APPROVE",2L,null,null);
        assertThat(approved.status()).isEqualTo("ACTIVE");assertThat(approved.deptId()).isEqualTo(2L);
        assertThat(approved.roles()).extracting(RoleBrief::code).containsExactly("EMPLOYEE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE reason IS NULL OR btrim(reason)=''",Long.class)).isZero();
        as(2);assertThatThrownBy(()->users.list(1,20,null,null,null)).isInstanceOf(BizException.class);
    }

    @Test void grantsPrimaryHandlersPasswordsAndConfigurationAreAuditedAndValidated() {
        var grant=grants.create(new GrantCreate(4L,"FIN_STATS_READ","DEPT",1L,null,null,"财务核对"));
        assertThat(grant.active()).isTrue();assertThat(grants.revoke(grant.id(),"结束核对").active()).isFalse();
        assertThatThrownBy(()->grants.create(new GrantCreate(4L,"APP_READ","ALL",1L,null,null,"无效范围"))).isInstanceOf(BizException.class);
        users.change(2L,"GRANT_ROLE",null,"FINANCE_APPROVER","增加财务人员");
        users.change(2L,"PRIMARY",null,"FINANCE_APPROVER","调整主办人");
        assertThat(jdbc.queryForObject("SELECT user_id FROM user_role WHERE role_id=3 AND is_primary_handler",Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action='USER_PRIMARY_REPLACED'",Long.class)).isEqualTo(1);
        var temporary=users.resetPassword(2L,"密码遗失").get("tempPassword");
        assertThat(context.getBean(PasswordEncoder.class).matches(temporary,jdbc.queryForObject("SELECT password_hash FROM sys_user WHERE id=2",String.class))).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE before_data::text LIKE ? OR after_data::text LIKE ?",Long.class,"%"+temporary+"%","%"+temporary+"%")).isZero();
        assertThatThrownBy(()->config.update(SysConfigService.FALLBACK_APPROVER,new ConfigSave("USER:1","调整兜底"))).isInstanceOf(BizException.class);
        assertThat(config.update(SysConfigService.FALLBACK_APPROVER,new ConfigSave("USER:4","有效兜底")).value()).isEqualTo("USER:4");
        assertThatThrownBy(()->config.update(SysConfigService.TASK_OVERDUE_HOURS,new ConfigSave("0","错误时限"))).isInstanceOf(BizException.class);
        assertThatThrownBy(()->departments.remove(1L,"仍被引用")).isInstanceOf(BizException.class);
        assertThatThrownBy(()->grants.revoke(grant.id()," ")).isInstanceOf(BizException.class);
        var future=grants.create(new GrantCreate(5L,"FIN_STATS_READ","ALL",null,OffsetDateTime.now().plusDays(1),null,"未来授权"));
        assertThat(future.active()).isFalse();as(5);
        assertThatThrownBy(()->stats.finance(janStart(),janEnd())).isInstanceOf(BizException.class);
    }

    @Test void managementQueriesPaginateMetadataWithoutBusinessContent() {
        long app=application("EXPENSE","IN_APPROVAL",1000,1,"2026-01-01T02:00:00Z",0,2);
        long instance=jdbc.queryForObject("INSERT INTO flow_instance(application_id,template_id,template_version_id,version_no,snapshot) VALUES(?,3,3,1,'{}') RETURNING id",Long.class,app);
        long node=jdbc.queryForObject("INSERT INTO flow_node_instance(flow_instance_id,application_id,seq,node_key,name,approver_rule,mode,status,effective,timeout_hours) VALUES(?,?,1,'N1','财务审核','{}','SINGLE','ACTIVE',true,1) RETURNING id",Long.class,instance,app);
        jdbc.update("INSERT INTO approval_task(application_id,node_instance_id,assignee_id,status,created_at) VALUES(?,?,4,'PENDING',now()-interval '2 hours')",app,node);
        var queries=context.getBean(AdminQueryService.class);
        var tasks=queries.tasks(0,200,null,"用户2");
        assertThat(tasks.page()).isEqualTo(1);assertThat(tasks.size()).isEqualTo(100);assertThat(tasks.total()).isEqualTo(1);
        assertThat(tasks.records().get(0).overdue()).isTrue();
        String json=Jsons.write(tasks);assertThat(json).doesNotContain("amountCents","comment","description","passwordHash");
        assertThat(queries.auditLogs(1,20,null,null,null,null,null,null).total()).isZero();
        assertThat(queries.deliveries(1,20,null).total()).isZero();
        as(4);assertThat(stats.personal().pendingTaskCount()).isEqualTo(1);
        assertThatThrownBy(()->queries.tasks(1,20,null,null)).isInstanceOf(BizException.class);
    }

    private long application(String type,String status,long cents,long dept,String submitted,int hours,long applicant) {
        int template=switch(type){case "PURCHASE"->1;case "TRAVEL"->2;default->3;};
        OffsetDateTime time=OffsetDateTime.parse(submitted);
        return jdbc.queryForObject("""
                INSERT INTO application(app_no,type,template_id,template_version_id,applicant_id,dept_id,status,amount_cents,submitted_at,finished_at)
                VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id
                """,Long.class,"TEST"+UUID.randomUUID().toString().replace("-","").substring(0,24),type,template,template,applicant,dept,status,cents,time,
                "IN_APPROVAL".equals(status)?null:time.plusHours(hours));
    }
    private void statsData() {
        long expense=application("EXPENSE","APPROVED",1000,1,"2025-12-31T16:00:00Z",2,2);
        long rejected=application("EXPENSE","REJECTED",500,1,"2026-01-02T02:00:00Z",4,2);
        application("PURCHASE","IN_APPROVAL",3000,1,"2026-01-03T02:00:00Z",0,2);
        application("TRAVEL","WITHDRAWN",7000,1,"2026-01-04T02:00:00Z",1,2);
        application("TRAVEL","APPROVED",0,1,"2026-01-31T15:59:00Z",6,2);
        application("PURCHASE","APPROVED",4000,1,"2026-01-05T02:00:00Z",8,2);
        application("EXPENSE","APPROVED",9000,1,"2026-01-31T16:00:00Z",20,2);
        long market=application("EXPENSE","APPROVED",9000,2,"2026-01-05T02:00:00Z",10,5);
        jdbc.update("INSERT INTO expense_item(application_id,seq,expense_type_id,amount_cents,no_invoice,no_invoice_reason) VALUES(?,1,1,200,true,'无票交通'),(?,2,2,800,false,null),(?,1,1,9000,true,'无票支出'),(?,1,1,500,true,'被驳回')",expense,expense,market,rejected);
        jdbc.update("INSERT INTO application(app_no,type,template_id,applicant_id,status) VALUES('DRAFT','EXPENSE',3,2,'DRAFT')");
        jdbc.update("INSERT INTO application(app_no,type,template_id,applicant_id,status,deleted_at) VALUES('DELETED','EXPENSE',3,2,'DRAFT',now())");
        // 历史部门固定在申请，随后调动申请人。
        users.change(2L,"DEPT",2L,null,"调入市场部");
    }
    private LocalDate janStart(){return LocalDate.of(2026,1,1);}
    private LocalDate janEnd(){return LocalDate.of(2026,1,31);}

    @Test void departmentStatsUseSubmissionTimeFrozenDepartmentAndTerminalDenominator() {
        statsData();as(3);
        var result=stats.department(janStart(),janEnd(),1L);
        assertThat(result.totals().count()).isEqualTo(6);assertThat(result.totals().approvedCount()).isEqualTo(3);
        assertThat(result.totals().approvedAmountCents()).isEqualTo(5000);assertThat(result.totals().inProgressAmountCents()).isEqualTo(3000);
        assertThat(result.totals().approvalRate()).isEqualTo(.75);assertThat(result.totals().avgApprovalHours()).isEqualTo(5);
        assertThat(result.monthly()).hasSize(1);assertThat(result.monthly().get(0).month()).isEqualTo("2026-01");assertThat(result.monthly().get(0).count()).isEqualTo(6);
        assertThatThrownBy(()->stats.department(janStart(),janEnd(),2L)).isInstanceOf(BizException.class);
        assertThatThrownBy(()->stats.department(janStart(),janEnd(),null)).isInstanceOf(BizException.class);
        assertThatThrownBy(()->stats.department(janEnd(),janStart(),1L)).isInstanceOf(BizException.class);
        var empty=stats.department(LocalDate.of(2020,1,1),LocalDate.of(2020,1,31),1L);
        assertThat(empty.totals().count()).isZero();assertThat(empty.totals().approvalRate()).isNull();assertThat(empty.totals().avgApprovalHours()).isNull();
        as(2);assertThat(stats.personal().statusCounts().get("DRAFT")).isEqualTo(1);assertThat(stats.personal().approvedAmountCents()).isEqualTo(14000);
    }

    @Test void financeAndEnterpriseEnforceActiveDatabaseGrantsAndNeverMultiplyInvoiceAmounts() {
        statsData();as(4);assertThatThrownBy(()->stats.finance(janStart(),janEnd())).isInstanceOf(BizException.class);
        as(1);var limited=grants.create(new GrantCreate(4L,"FIN_STATS_READ","DEPT",1L,null,null,"部门财务分析"));
        as(4);var finance=stats.finance(janStart(),janEnd());
        assertThat(finance.byExpenseType()).extracting(t->t.approvedAmountCents()).containsExactly(200L,800L);
        assertThat(finance.noInvoice().count()).isEqualTo(1);assertThat(finance.noInvoice().amountCents()).isEqualTo(200);assertThat(finance.noInvoice().ratio()).isEqualTo(.2);
        assertThat(finance.byDept()).hasSize(1);assertThat(finance.byDept().get(0).expenseAmountCents()).isEqualTo(1000);
        assertThat(finance.byDept().get(0).purchaseAmountCents()).isEqualTo(4000);
        assertThatThrownBy(()->stats.enterprise(janStart(),janEnd())).isInstanceOf(BizException.class);
        as(1);grants.revoke(limited.id(),"回收部门财务权限");as(4);
        assertThatThrownBy(()->stats.finance(janStart(),janEnd())).isInstanceOf(BizException.class);
        as(1);var readDept=grants.create(new GrantCreate(4L,"APP_READ","DEPT",1L,null,null,"部门查询"));as(4);
        assertThatThrownBy(()->stats.enterprise(janStart(),janEnd())).isInstanceOf(BizException.class);
        as(1);grants.create(new GrantCreate(4L,"APP_READ","ALL",null,null,null,"企业分析"));
        var allFinance=grants.create(new GrantCreate(4L,"FIN_STATS_READ","ALL",null,null,null,"全部财务分析"));as(4);
        assertThat(stats.enterprise(janStart(),janEnd()).byDept()).hasSize(2);
        assertThat(stats.finance(janStart(),janEnd()).noInvoice().ratio()).isEqualTo(.92);
        // 即使当前 principal 曾持有授权，数据库过期后本次查询也必须拒绝。
        jdbc.update("UPDATE data_scope_grant SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE id=?",allFinance.id());
        assertThatThrownBy(()->stats.finance(janStart(),janEnd())).isInstanceOf(BizException.class);
        assertThat(readDept.active()).isTrue();
    }

    @Test void httpRoutesReturnContractAndRejectUnauthorizedTemplateAccess() throws Exception {
        long id=custom();templates.saveDraft(id,draft("初审"));templates.publish(id,"启用测试");templates.setEnabled(id,true,"启用测试");
        as(2);mvc.perform(get("/templates/{id}/current",id)).andExpect(status().isOk()).andExpect(jsonPath("$.data.versionNo").value(1)).andExpect(jsonPath("$.data.formSchema.fields[0].key").value("purpose"));
        mvc.perform(get("/admin/templates")).andExpect(status().isForbidden());
        mvc.perform(get("/stats/personal")).andExpect(status().isOk()).andExpect(jsonPath("$.data.statusCounts.DRAFT").value(0));
        mvc.perform(get("/stats/enterprise")).andExpect(status().isForbidden());
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass=true)
    @MapperScan("edu.zju.eas.repository")
    @Import({TemplateService.class,TemplatePublishValidator.class,StatsService.class,AdminSupport.class,UserAdminService.class,
            DepartmentAdminService.class,GrantAdminService.class,ConfigAdminService.class,AdminQueryService.class,DepartmentService.class,
            AuditService.class,AuthInfoService.class,SysConfigService.class})
    static class TestConfig {
        @Bean DataSource dataSource(){return source;}
        @Bean JdbcTemplate jdbcTemplate(DataSource ds){return new JdbcTemplate(ds);}
        @Bean PlatformTransactionManager transactionManager(DataSource ds){return new DataSourceTransactionManager(ds);}
        @Bean SqlSessionFactory sqlSessionFactory(DataSource ds) throws Exception {
            MybatisSqlSessionFactoryBean bean=new MybatisSqlSessionFactoryBean();bean.setDataSource(ds);
            com.baomidou.mybatisplus.core.MybatisConfiguration config=new com.baomidou.mybatisplus.core.MybatisConfiguration();config.setMapUnderscoreToCamelCase(true);bean.setConfiguration(config);return bean.getObject();
        }
        @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder();}
        @Bean Clock clock(){return Clock.systemUTC();}
        @Bean NotificationService notifications(){return mock(NotificationService.class);}
    }
}

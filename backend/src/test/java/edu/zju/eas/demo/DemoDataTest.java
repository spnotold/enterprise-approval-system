package edu.zju.eas.demo;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.service.file.StorageService;
import edu.zju.eas.repository.ProcessTemplateMapper;
import edu.zju.eas.repository.ProcessTemplateVersionMapper;
import edu.zju.eas.service.template.TemplatePublishValidator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** demo profile 在全新数据库上启动：演示账号可登录、模板可通过发布校验、示例申请走完真实流程，重复启动不重复生成。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@EnabledIfEnvironmentVariable(named = "EAS_TEST_PG_URL", matches = ".+")
class DemoDataTest {
    private static final String DB = "eas_demo_test_" + UUID.randomUUID().toString().replace("-", "");

    private static JdbcTemplate admin() {
        return new JdbcTemplate(new DriverManagerDataSource(System.getenv("EAS_TEST_PG_URL"),
                System.getenv("EAS_TEST_PG_USER"), System.getenv("EAS_TEST_PG_PASSWORD")));
    }

    private static String dbUrl() {
        String url = System.getenv("EAS_TEST_PG_URL");
        return url.substring(0, url.lastIndexOf('/') + 1) + DB;
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry p) {
        admin().execute("CREATE DATABASE " + DB);
        p.add("spring.datasource.url", DemoDataTest::dbUrl);
        p.add("spring.datasource.username", () -> System.getenv("EAS_TEST_PG_USER"));
        p.add("spring.datasource.password", () -> System.getenv("EAS_TEST_PG_PASSWORD"));
        p.add("spring.flyway.user", () -> System.getenv("EAS_TEST_PG_USER"));
        p.add("spring.flyway.password", () -> System.getenv("EAS_TEST_PG_PASSWORD"));
        p.add("eas.jwt.secret", () -> "test-secret-for-integration-tests-only-32b");
        p.add("eas.minio.secret-key", () -> "integration-test-key");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TemplatePublishValidator validator;
    @Autowired ProcessTemplateMapper templates;
    @Autowired ProcessTemplateVersionMapper versions;
    @Autowired DemoDataInitializer initializer;
    @MockBean StorageService storage;

    @AfterAll
    void dropDatabase() {
        ((com.zaxxer.hikari.HikariDataSource) jdbc.getDataSource()).close();
        admin().execute("DROP DATABASE IF EXISTS " + DB + " WITH (FORCE)");
    }

    @Test
    void demoAccountsLogIn() throws Exception {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sys_user", Integer.class)).isEqualTo(10);
        var ok = mvc.perform(post("/auth/login").contentType("application/json")
                .content(Jsons.write(Map.of("account", "rd_emp_wang", "password", "Demo@2026")))).andReturn();
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        var pending = mvc.perform(post("/auth/login").contentType("application/json")
                .content(Jsons.write(Map.of("account", "pending_he", "password", "Demo@2026")))).andReturn();
        JsonNode body = Jsons.read(pending.getResponse().getContentAsString(), JsonNode.class);
        assertThat(pending.getResponse().getStatus()).isEqualTo(403);
        assertThat(body.path("code").asInt()).isEqualTo(40104);
        // 管理员没有 TASK_HANDLE
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id
                  JOIN permission p ON p.id = rp.permission_id WHERE ur.user_id = 1 AND p.code = 'TASK_HANDLE'
                """, Integer.class)).isZero();
    }

    @Test
    void customTemplatesPassPublishValidation() {
        for (long id : new long[]{4, 5}) {
            assertThat(validator.validate(templates.selectById(id), versions.selectById(id), java.util.List.of())).isEmpty();
        }
    }

    @Test
    void sampleApplicationsFollowRealFlow() {
        assertThat(jdbc.queryForList("SELECT type || ':' || status FROM application WHERE applicant_id = 4 ORDER BY id", String.class))
                .containsExactly("TRAVEL:APPROVED", "PURCHASE:IN_APPROVAL", "EXPENSE:REJECTED");
        // 采购停在财务预算审查，由财务主办人吴审处理
        assertThat(jdbc.queryForObject("""
                SELECT t.assignee_id FROM approval_task t JOIN application a ON a.id = t.application_id
                 WHERE a.applicant_id = 4 AND a.type = 'PURCHASE' AND t.status = 'PENDING'
                """, Long.class)).isEqualTo(9L);
        // 周敏请假 5 天 > 3 天：企业负责人节点生效（数字字段按数值比较），当前在孙经理处
        assertThat(jdbc.queryForObject("""
                SELECT n.effective FROM flow_node_instance n JOIN application a ON a.id = n.application_id
                 WHERE a.applicant_id = 7 AND n.seq = 2
                """, Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("""
                SELECT t.assignee_id FROM approval_task t JOIN application a ON a.id = t.application_id
                 WHERE a.applicant_id = 7 AND t.status = 'PENDING'
                """, Long.class)).isEqualTo(6L);
        // 再次启动不重复生成
        initializer.run(null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM application", Integer.class)).isEqualTo(4);
    }
}

package edu.zju.eas;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.Jsons;
import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.TokenService;
import edu.zju.eas.service.SysConfigService;
import edu.zju.eas.service.file.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * 端到端集成测试基类：真实 PostgreSQL 16（Flyway 迁移 + 演示账号与模板），MockMvc 走完整的安全过滤链。
 * 整个 JVM 共用一个新建的临时库；每个用例开始前清空业务数据并重放种子脚本。
 * 需要可建库的测试账号：EAS_TEST_PG_URL / EAS_TEST_PG_USER / EAS_TEST_PG_PASSWORD（见 ~/tools/env.sh）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@EnabledIfEnvironmentVariable(named = "EAS_TEST_PG_URL", matches = ".+")
public abstract class IntegrationTestBase {
    protected static final String PASSWORD = "Demo@2026";
    protected static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    private static final String DB = "eas_it_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean created;

    static synchronized void createDatabase() {
        if (created) return;
        new JdbcTemplate(adminSource()).execute("CREATE DATABASE " + DB);
        created = true;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                new JdbcTemplate(adminSource()).execute("DROP DATABASE IF EXISTS " + DB + " WITH (FORCE)");
            } catch (RuntimeException ignored) {
                // 测试库带随机后缀，清理失败不影响下次运行
            }
        }));
    }

    private static DataSource adminSource() {
        return new DriverManagerDataSource(System.getenv("EAS_TEST_PG_URL"),
                System.getenv("EAS_TEST_PG_USER"), System.getenv("EAS_TEST_PG_PASSWORD"));
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry p) {
        createDatabase();
        String url = System.getenv("EAS_TEST_PG_URL");
        p.add("spring.datasource.url", () -> url.substring(0, url.lastIndexOf('/') + 1) + DB);
        p.add("spring.datasource.username", () -> System.getenv("EAS_TEST_PG_USER"));
        p.add("spring.datasource.password", () -> System.getenv("EAS_TEST_PG_PASSWORD"));
        p.add("spring.flyway.user", () -> System.getenv("EAS_TEST_PG_USER"));
        p.add("spring.flyway.password", () -> System.getenv("EAS_TEST_PG_PASSWORD"));
        p.add("eas.jwt.secret", () -> "test-secret-for-integration-tests-only-32b");
        p.add("eas.minio.secret-key", () -> "integration-test-key");
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected TokenService tokens;
    @Autowired protected AuthInfoService authInfo;
    @Autowired protected SysConfigService config;
    @MockBean protected StorageService storage;

    @BeforeEach
    void resetDemoData() {
        List<String> tables = jdbc.queryForList(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history'",
                String.class);
        jdbc.execute("TRUNCATE " + String.join(", ", tables) + " RESTART IDENTITY CASCADE");
        new ResourceDatabasePopulator(
                new ClassPathResource("db/migration/V3__seed_base.sql"),
                new ClassPathResource("db/migration/V4__seed_builtin_templates.sql"),
                new ClassPathResource("db/demo/R__seed_demo.sql")).execute(jdbc.getDataSource());
        jdbc.update("UPDATE sys_config SET config_value = 'false' WHERE config_key = 'mail.enabled'");
        authInfo.evictAll();
        config.evict();
    }

    // ------------------------------------------------------------------ 身份与请求

    protected long uid(String username) {
        return jdbc.queryForObject("SELECT id FROM sys_user WHERE username = ?", Long.class, username);
    }

    protected MvcResult call(MockHttpServletRequestBuilder request, String username, Object body) throws Exception {
        if (username != null) {
            long id = uid(username);
            int tv = jdbc.queryForObject("SELECT token_version FROM sys_user WHERE id = ?", Integer.class, id);
            request.header("Authorization", "Bearer " + tokens.issueAccess(id, tv));
        }
        if (body != null) request.contentType("application/json").content(Jsons.write(body));
        return mvc.perform(request).andReturn();
    }

    protected MvcResult action(String path, String username, Object body, String key) throws Exception {
        return call(post(path).header("Idempotency-Key", key), username, body);
    }

    protected static JsonNode body(MvcResult r) throws Exception {
        return Jsons.read(r.getResponse().getContentAsString(), JsonNode.class);
    }

    protected static JsonNode data(MvcResult r) throws Exception {
        JsonNode b = body(r);
        assertEquals(0, b.path("code").asInt(), b.toString());
        return b.path("data");
    }

    protected static int code(MvcResult r) throws Exception {
        return body(r).path("code").asInt();
    }

    protected static String key() {
        return "it-" + UUID.randomUUID();
    }

    protected static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    // ------------------------------------------------------------------ 业务快捷操作

    protected Map<String, Object> travelBody(long budgetCents) {
        OffsetDateTime start = LocalDate.now(CN).plusDays(3).atTime(9, 0).atZone(CN).toOffsetDateTime();
        return map("title", "集成测试出差", "origin", "杭州", "destination", "上海",
                "startTime", start.toString(), "endTime", start.plusDays(1).withHour(18).toString(),
                "transport", "TRAIN", "purpose", "客户交流", "budgetCents", budgetCents);
    }

    protected Map<String, Object> expenseItem(long cents) {
        return map("expenseTypeCode", "TRANSPORT", "occurDate", LocalDate.now(CN).minusDays(1).toString(),
                "purpose", "市内交通", "amountCents", cents, "noInvoice", true,
                "noInvoiceReason", "出租车司机无法开具发票");
    }

    protected Map<String, Object> expenseBody(List<?> items) {
        return map("title", "集成测试报销", "independentReason", "无关联申请的日常报销", "items", items);
    }

    /** 建草稿，返回申请 ID */
    protected long draft(String type, String username, Object body) throws Exception {
        MvcResult r = call(post("/applications/" + type), username, body);
        assertEquals(200, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        return data(r).path("id").asLong();
    }

    protected int version(long appId) {
        return jdbc.queryForObject("SELECT version FROM application WHERE id = ?", Integer.class, appId);
    }

    protected String status(long appId) {
        return jdbc.queryForObject("SELECT status FROM application WHERE id = ?", String.class, appId);
    }

    protected MvcResult submit(long appId, String username) throws Exception {
        return action("/applications/" + appId + "/submit", username, map("appVersion", version(appId)), key());
    }

    /** 建草稿并提交，返回申请 ID */
    protected long submitted(String type, String username, Object body) throws Exception {
        long id = draft(type, username, body);
        MvcResult r = submit(id, username);
        assertEquals(200, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        return id;
    }

    protected Long pendingTask(long appId, String username) {
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM approval_task WHERE application_id = ? AND assignee_id = ? AND status = 'PENDING'",
                Long.class, appId, uid(username));
        return ids.isEmpty() ? null : ids.get(0);
    }

    protected MvcResult approve(long appId, String username) throws Exception {
        Long task = pendingTask(appId, username);
        return action("/tasks/" + task + "/approve", username, map("appVersion", version(appId), "comment", "同意"), key());
    }
}

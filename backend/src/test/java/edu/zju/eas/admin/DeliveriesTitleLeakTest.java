package edu.zju.eas.admin;

import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** 管理员查邮件投递记录：未覆盖申请部门的 BIZ_CONTENT_READ 授权时，标题脱敏为通用描述，不泄漏申请业务标题 */
class DeliveriesTitleLeakTest extends IntegrationTestBase {

    private static final String SECRET_TITLE = "机密并购尽调行程";

    /** 触发一张差旅申请产生邮件投递记录，返回申请编号 */
    private String submitTravelWithDelivery() throws Exception {
        jdbc.update("UPDATE sys_config SET config_value = 'true' WHERE config_key = 'mail.enabled'");
        config.evict();
        var body = travelBody(100_000);
        body.put("title", SECRET_TITLE);
        long app = submitted("travel", "rd_emp_wang", body);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM notification_delivery d JOIN notification n ON n.id = d.notification_id
                WHERE n.application_id = ? AND n.type = 'TASK_ASSIGNED'
                """, Long.class, app)).isEqualTo(1);
        return jdbc.queryForObject("SELECT app_no FROM application WHERE id = ?", String.class, app);
    }

    @Test
    void tAdminWithoutGrantSeesMaskedTitleOnly() throws Exception {
        String appNo = submitTravelWithDelivery();
        MvcResult r = call(get("/admin/deliveries"), "admin", null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(r.getResponse().getContentAsString()).doesNotContain(SECRET_TITLE);
        JsonNode records = data(r).path("records");
        assertThat(records.size()).isEqualTo(1);
        JsonNode row = records.get(0);
        // 标题脱敏为不含业务标题的通用描述；运维排障所需字段保持完整
        assertThat(row.path("title").asText()).isEqualTo("审批通知 #" + appNo);
        assertThat(row.path("recipientEmail").asText()).isEqualTo("rd_head_li@eas.local");
        assertThat(row.path("status").asText()).isEqualTo("PENDING");
        assertThat(row.path("attempts").asInt()).isZero();
        assertThat(row.path("createdAt").asText()).isNotBlank();
    }

    @Test
    void tAdminCoveringDeptWithBizContentReadGrantSeesTitle() throws Exception {
        String appNo = submitTravelWithDelivery();
        jdbc.update("""
                INSERT INTO data_scope_grant (user_id, permission_code, scope_type, reason, granted_by)
                VALUES (?, 'BIZ_CONTENT_READ', 'ALL', '运维排障需要核对通知标题', ?)
                """, uid("admin"), uid("admin"));
        authInfo.evictAll();
        MvcResult r = call(get("/admin/deliveries"), "admin", null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode row = data(r).path("records").get(0);
        assertThat(row.path("title").asText()).contains(SECRET_TITLE).contains(appNo);
    }
}

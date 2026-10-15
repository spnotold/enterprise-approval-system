package edu.zju.eas.notify;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T13 通知去重与隔离 */
class NotificationTest extends IntegrationTestBase {

    @Test
    void t13_singleTaskAssignedAndNoCrossUserAccess() throws Exception {
        long app = draft("travel", "rd_emp_wang", travelBody(100_000));
        String key = key();
        Object body = map("appVersion", version(app));
        assertThat(action("/applications/" + app + "/submit", "rd_emp_wang", body, key).getResponse().getStatus()).isEqualTo(200);
        assertThat(action("/applications/" + app + "/submit", "rd_emp_wang", body, key).getResponse().getStatus()).isEqualTo(200);

        long assigned = jdbc.queryForObject("""
                SELECT count(*) FROM notification WHERE recipient_id = ? AND application_id = ? AND type = 'TASK_ASSIGNED'
                """, Long.class, uid("rd_head_li"), app);
        assertThat(assigned).isEqualTo(1);
        long notice = jdbc.queryForObject("""
                SELECT id FROM notification WHERE recipient_id = ? AND application_id = ? AND type = 'TASK_ASSIGNED'
                """, Long.class, uid("rd_head_li"), app);

        MvcResult foreign = call(post("/notifications/" + notice + "/read"), "rd_emp_chen", null);
        assertThat(foreign.getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT read_at IS NULL FROM notification WHERE id = ?", Boolean.class, notice)).isTrue();

        assertThat(data(call(get("/notifications/unread-count"), "rd_head_li", null)).path("count").asInt()).isEqualTo(1);
        assertThat(call(post("/notifications/" + notice + "/read"), "rd_head_li", null).getResponse().getStatus()).isEqualTo(200);
        assertThat(data(call(get("/notifications/unread-count"), "rd_head_li", null)).path("count").asInt()).isZero();
    }
}

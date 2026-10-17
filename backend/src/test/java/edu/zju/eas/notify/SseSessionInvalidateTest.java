package edu.zju.eas.notify;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.service.notify.SseHub;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** 会话失效（停用、改密码）后，该用户已打开的 SSE 连接随即关闭；单设备登出不关闭 */
class SseSessionInvalidateTest extends IntegrationTestBase {
    private static final String COOKIE = "eas_rt";

    @Autowired SseHub sse;

    @AfterEach
    void dropEmitters() {
        sse.close(uid("rd_emp_wang"));
    }

    @Test
    void disableClosesSseStream() throws Exception {
        long id = uid("rd_emp_wang");
        sse.register(id);
        assertThat(sse.connectionCount()).isEqualTo(1);

        MvcResult r = action("/admin/users/" + id + "/disable", "admin", map("reason", "集成测试停用"), key());
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(sse.connectionCount()).isZero();
    }

    @Test
    void changePasswordClosesSseStream() throws Exception {
        sse.register(uid("rd_emp_wang"));
        assertThat(sse.connectionCount()).isEqualTo(1);

        MvcResult r = call(put("/me/password"), "rd_emp_wang",
                map("oldPassword", PASSWORD, "newPassword", "Demo@2027"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(sse.connectionCount()).isZero();
    }

    /** 登出只撤销本设备那一族刷新令牌，同一用户的其他设备仍在推送，不能误关 */
    @Test
    void logoutKeepsSseStream() throws Exception {
        MvcResult login = call(post("/auth/login"), null, map("account", "rd_emp_wang", "password", PASSWORD));
        assertThat(login.getResponse().getStatus()).isEqualTo(200);
        Cookie cookie = login.getResponse().getCookie(COOKIE);

        sse.register(uid("rd_emp_wang"));
        MvcResult r = call(post("/auth/logout").cookie(cookie), null, null);
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_token WHERE revoked_at IS NOT NULL",
                Long.class)).isEqualTo(1);
        assertThat(sse.connectionCount()).isEqualTo(1);
    }
}

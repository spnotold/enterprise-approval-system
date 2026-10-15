package edu.zju.eas.security;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** T01 越权查看、T02 跨部门隔离、T03 非当前审批人、T04 管理员不能审批、T15 注册审核 */
class AccessControlTest extends IntegrationTestBase {

    @Test
    void t01_colleagueCannotSeeOthersApplication() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        assertThat(call(get("/applications/" + app), "rd_emp_chen", null).getResponse().getStatus()).isEqualTo(404);
        List<Long> mine = data(call(get("/applications?scope=mine"), "rd_emp_chen", null))
                .path("records").findValues("id").stream().map(n -> n.asLong()).toList();
        assertThat(mine).doesNotContain(app);
        assertThat(call(get("/applications/" + app + "/logs"), "rd_emp_chen", null).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void t02_deptHeadOnlySeesOwnDepartment() throws Exception {
        long rd = submitted("travel", "rd_emp_wang", travelBody(100_000));
        long mkt = submitted("travel", "mkt_emp_zhou", travelBody(100_000));
        List<Long> dept = data(call(get("/applications?scope=dept"), "mkt_head_sun", null))
                .path("records").findValues("id").stream().map(n -> n.asLong()).toList();
        assertThat(dept).contains(mkt).doesNotContain(rd);
        assertThat(call(get("/applications/" + rd), "mkt_head_sun", null).getResponse().getStatus()).isEqualTo(404);
        assertThat(call(get("/applications/" + mkt), "mkt_head_sun", null).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void t03_onlyCurrentApproverCanAct() throws Exception {
        long app = submitted("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(50_000))));
        Long task = pendingTask(app, "rd_head_li");
        MvcResult r = action("/tasks/" + task + "/approve", "fin_auditor_wu", map("appVersion", version(app)), key());
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(code(r)).isEqualTo(40302);
        assertThat(status(app)).isEqualTo("IN_APPROVAL");
    }

    @Test
    void t04_adminCannotApprove() throws Exception {
        long app = submitted("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(50_000))));
        Long task = pendingTask(app, "rd_head_li");
        MvcResult r = action("/tasks/" + task + "/approve", "admin", map("appVersion", version(app)), key());
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(code(r)).isEqualTo(40301);
        assertThat(call(get("/tasks/pending"), "admin", null).getResponse().getStatus()).isEqualTo(403);
        // 管理员不能打开员工申请的业务详情
        assertThat(call(get("/applications/" + app), "admin", null).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void t15_pendingRegistrationCannotLogIn() throws Exception {
        MvcResult r = call(post("/auth/login"), null, map("account", "pending_he", "password", PASSWORD));
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(code(r)).isEqualTo(40104);
        MvcResult ok = call(post("/auth/login"), null, map("account", "rd_emp_wang", "password", PASSWORD));
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(data(ok).path("accessToken").asText()).isNotBlank();
        MvcResult bad = call(post("/auth/login"), null, map("account", "rd_emp_wang", "password", "wrong-password"));
        assertThat(code(bad)).isEqualTo(40103);
    }
}

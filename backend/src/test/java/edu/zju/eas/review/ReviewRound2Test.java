package edu.zju.eas.review;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** 第二轮跨模型审查（gpt-6.1-sol）发现问题的回归测试 */
class ReviewRound2Test extends IntegrationTestBase {

    private void grantRole(String username, String role) {
        jdbc.update("INSERT INTO user_role (user_id, role_id) SELECT ?, id FROM role WHERE code = ?", uid(username), role);
        authInfo.evictAll();
    }

    @Test
    void adminWithBusinessRoleStillCannotApproveOrReceiveTransfers() throws Exception {
        grantRole("admin", "EMPLOYEE");
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");
        MvcResult toAdmin = call(post("/admin/tasks/" + task + "/transfer"), "admin",
                map("toUserId", uid("admin"), "reason", "试图转给自己"));
        assertThat(toAdmin.getResponse().getStatus()).isEqualTo(422);
        assertThat(call(get("/tasks/pending"), "admin", null).getResponse().getStatus()).isEqualTo(403);
        // 即使数据层面把待办指给管理员，批准也被拒绝
        jdbc.update("UPDATE approval_task SET assignee_id = ? WHERE id = ?", uid("admin"), task);
        MvcResult approve = action("/tasks/" + task + "/approve", "admin", map("appVersion", version(app)), key());
        assertThat(approve.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void transferCannotGiveSecondVoteToSomeoneWhoAlreadyActedOnNode() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");
        // 模拟会签节点上赵总已投过同意票
        jdbc.update("""
                INSERT INTO approval_task (application_id, node_instance_id, assignee_id, status, acted_at)
                SELECT application_id, node_instance_id, ?, 'APPROVED', now() FROM approval_task WHERE id = ?
                """, uid("ceo_zhao"), task);
        MvcResult r = call(post("/admin/tasks/" + task + "/transfer"), "admin",
                map("toUserId", uid("ceo_zhao"), "reason", "转给已审批过的人"));
        assertThat(r.getResponse().getStatus()).isEqualTo(422);
        assertThat(pendingTask(app, "rd_head_li")).isEqualTo(task);
    }

    @Test
    void adminGrantedListAndLinkedReadsAreAudited() throws Exception {
        submitted("travel", "rd_emp_wang", travelBody(100_000));
        jdbc.update("""
                INSERT INTO data_scope_grant (user_id, permission_code, scope_type, reason, granted_by)
                VALUES (?, 'BIZ_CONTENT_READ', 'ALL', '审计抽查', ?)
                """, uid("admin"), uid("admin"));
        authInfo.evictAll();
        MvcResult list = call(get("/applications?scope=granted"), "admin", null);
        assertThat(list.getResponse().getStatus()).as(list.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'BIZ_CONTENT_READ' AND target_type = 'APPLICATION_LIST'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void fractionalCentsAreRejected() throws Exception {
        var body = travelBody(100_000);
        body.put("budgetCents", 123.99);
        MvcResult r = call(post("/applications/travel"), "rd_emp_wang", body);
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void customTextFieldRejectsEmptyArray() throws Exception {
        long version = jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id = 4", Long.class);
        MvcResult r = call(post("/applications/custom"), "rd_emp_wang",
                map("templateId", 4, "templateVersionId", version, "title", "请假", "formValues", map("reason", List.of())));
        assertThat(r.getResponse().getStatus()).isIn(400, 422);
        assertThat(body(r).path("errors").findValuesAsText("field")).contains("formValues.reason");
    }
}

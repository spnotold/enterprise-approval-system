package edu.zju.eas.flow;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.common.Jsons;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 审批人资格统一：ACTIVE 且拥有 TASK_HANDLE 且非系统管理员。缺任一资格时，提交走替代规则、转办返回业务错误。 */
class ApproverEligibilityTest extends IntegrationTestBase {

    /** 建一个首节点为“指定审批人 = approverId”的自定义模板（无 fallbackRule，走默认企业负责人替代） */
    private long templateWithSpecifiedApprover(long approverId) {
        String code = "ELIG_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        long template = jdbc.queryForObject(
                "INSERT INTO process_template(code,name,category,biz_type,enabled) VALUES (?,?,'CUSTOM','CUSTOM',true) RETURNING id",
                Long.class, code, "审批人资格回归模板");
        var config = map("nodes", List.of(
                map("nodeKey", "N1", "name", "指定审批", "approverRule",
                        map("type", "SPECIFIED_USER", "userId", approverId)),
                map("nodeKey", "N2", "name", "最终审批", "approverRule",
                        map("type", "SPECIFIED_USER", "userId", uid("ceo_zhao")))));
        long version = jdbc.queryForObject(
                "INSERT INTO process_template_version(template_id,version_no,status,form_schema,node_config,published_at) VALUES (?,1,'PUBLISHED',?::jsonb,?::jsonb,now()) RETURNING id",
                Long.class, template,
                Jsons.write(map("fields", List.of(map("key", "note", "label", "说明", "type", "TEXT")))),
                Jsons.write(config));
        jdbc.update("UPDATE process_template SET current_version_id=? WHERE id=?", version, template);
        return template;
    }

    private long currentVersion(long template) {
        return jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id=?", Long.class, template);
    }

    @Test
    void submitSubstitutesApproverWhoLostTaskHandlePermission() throws Exception {
        long approver = uid("rd_emp_chen");   // 仅持有 EMPLOYEE 角色
        long template = templateWithSpecifiedApprover(approver);

        // 撤销 U 唯一角色：U 仍 ACTIVE，但不再拥有 TASK_HANDLE
        jdbc.update("DELETE FROM user_role WHERE user_id=?", approver);
        authInfo.evictAll();

        long app = submitted("custom", "rd_emp_wang",
                map("templateId", template, "templateVersionId", currentVersion(template),
                        "title", "审批人资格回归", "formValues", map("note", "测试")));

        assertThat(pendingTask(app, "rd_emp_chen")).isNull();
        assertThat(pendingTask(app, "ceo_zhao")).isNotNull();
        String note = jdbc.queryForObject(
                "SELECT resolve_note FROM flow_node_instance WHERE application_id=? AND seq=1", String.class, app);
        assertThat(note).contains("替代");
    }

    @Test
    void transferRejectsUserWhoLostTaskHandlePermission() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");

        // 撤销 U 唯一角色：U 仍 ACTIVE，但不再拥有 TASK_HANDLE
        jdbc.update("DELETE FROM user_role WHERE user_id=?", uid("rd_emp_chen"));
        authInfo.evictAll();

        MvcResult r = call(post("/admin/tasks/" + task + "/transfer"), "admin",
                map("toUserId", uid("rd_emp_chen"), "reason", "转给无待办权限的人"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(422);
        assertThat(code(r)).isEqualTo(42201);
        assertThat(pendingTask(app, "rd_head_li")).isEqualTo(task);
    }
}

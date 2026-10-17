package edu.zju.eas.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** T14 版本快照：发布新版本不影响已提交的申请；路径预览与提交同口径反馈模板问题 */
class TemplateVersionTest extends IntegrationTestBase {

    private boolean thirdNodeEffective(long app) {
        return jdbc.queryForObject(
                "SELECT effective FROM flow_node_instance WHERE application_id = ? AND seq = 3", Boolean.class, app);
    }

    /** 按当前发布版本建一个请假草稿（模板 4 = LEAVE） */
    private long leaveDraft() throws Exception {
        return draft("custom", "rd_emp_wang", map("templateId", 4L, "templateVersionId", 4L,
                "title", "集成测试请假", "formValues", map("leaveType", "PERSONAL")));
    }

    private JsonNode pathPreview(long app) throws Exception {
        MvcResult r = call(get("/applications/" + app + "/path-preview"), "rd_emp_wang", null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return data(r);
    }

    @Test
    void t14_publishedVersionDoesNotRewriteSubmittedApplications() throws Exception {
        // 6000 元：旧版本阈值 1 万元，不经过企业负责人
        long before = submitted("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(600_000))));
        assertThat(thirdNodeEffective(before)).isFalse();

        JsonNode draft = data(call(post("/admin/templates/3/draft"), "admin", null));
        ObjectNode nodeConfig = (ObjectNode) draft.path("nodeConfig").deepCopy();
        ((ObjectNode) nodeConfig.path("nodes").get(2).path("condition").path("rules").get(0)).put("value", "500000");
        MvcResult saved = call(put("/admin/templates/3/draft"), "admin",
                map("formSchema", draft.path("formSchema"), "nodeConfig", nodeConfig));
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        MvcResult published = call(post("/admin/templates/3/publish"), "admin", map("changeNote", "企业负责人阈值调整为 5000 元"));
        assertThat(published.getResponse().getStatus()).as(published.getResponse().getContentAsString()).isEqualTo(200);

        long versionOfBefore = jdbc.queryForObject(
                "SELECT template_version_id FROM flow_instance WHERE application_id = ?", Long.class, before);
        assertThat(versionOfBefore).isEqualTo(3L);
        assertThat(thirdNodeEffective(before)).isFalse();
        assertThat(pendingTask(before, "rd_head_li")).isNotNull();

        long after = submitted("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(600_000))));
        assertThat(thirdNodeEffective(after)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action LIKE '%PUBLISH%'", Long.class)).isPositive();
    }

    @Test
    void t14_disabledTemplateIsReportedByPathPreview() throws Exception {
        long app = leaveDraft();
        assertThat(pathPreview(app).path("nodes").size()).isPositive();   // 停用前预览给出完整路径

        MvcResult disabled = call(post("/admin/templates/4/disable"), "admin", map("reason", "集成测试停用"));
        assertThat(disabled.getResponse().getStatus()).as(disabled.getResponse().getContentAsString()).isEqualTo(200);

        // 停用后预览返回空路径 + 停用提示，与提交被拒的理由一致
        JsonNode preview = pathPreview(app);
        assertThat(preview.path("nodes").size()).isZero();
        assertThat(preview.path("errors").size()).isEqualTo(1);
        assertThat(preview.path("errors").get(0).asText()).isEqualTo("该流程模板已停用，不能新建或提交");
        MvcResult blocked = action("/applications/" + app + "/submit", "rd_emp_wang", map("appVersion", version(app)), key());
        assertThat(blocked.getResponse().getStatus()).as(body(blocked).toString()).isEqualTo(422);
        assertThat(body(blocked).path("message").asText()).isEqualTo("该流程模板已停用，不能新建或提交");
        assertThat(status(app)).isEqualTo("DRAFT");
    }

    @Test
    void t14_staleCustomDraftIsReportedByPathPreview() throws Exception {
        long app = leaveDraft();
        assertThat(jdbc.queryForObject("SELECT template_version_id FROM custom_form_data WHERE application_id = ?", Long.class, app))
                .isEqualTo(4L);

        JsonNode draft = data(call(post("/admin/templates/4/draft"), "admin", null));
        MvcResult saved = call(put("/admin/templates/4/draft"), "admin",
                map("formSchema", draft.path("formSchema"), "nodeConfig", draft.path("nodeConfig")));
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        MvcResult published = call(post("/admin/templates/4/publish"), "admin", map("changeNote", "集成测试发布新版本"));
        assertThat(published.getResponse().getStatus()).as(published.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT current_version_id FROM process_template WHERE id = 4", Long.class))
                .isNotEqualTo(4L);

        // 按旧版本填写的草稿：预览返回空路径 + 模板已更新，提交同样被拒（40906）
        JsonNode preview = pathPreview(app);
        assertThat(preview.path("nodes").size()).isZero();
        assertThat(preview.path("errors").size()).isEqualTo(1);
        assertThat(preview.path("errors").get(0).asText()).isEqualTo("模板已更新，请按新版本确认后重新提交");
        MvcResult stale = action("/applications/" + app + "/submit", "rd_emp_wang", map("appVersion", version(app)), key());
        assertThat(stale.getResponse().getStatus()).as(stale.getResponse().getContentAsString()).isEqualTo(409);
        assertThat(code(stale)).isEqualTo(40906);
    }
}

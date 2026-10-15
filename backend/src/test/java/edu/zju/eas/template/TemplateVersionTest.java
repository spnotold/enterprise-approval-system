package edu.zju.eas.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** T14 版本快照：发布新版本不影响已提交的申请 */
class TemplateVersionTest extends IntegrationTestBase {

    private boolean thirdNodeEffective(long app) {
        return jdbc.queryForObject(
                "SELECT effective FROM flow_node_instance WHERE application_id = ? AND seq = 3", Boolean.class, app);
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
}

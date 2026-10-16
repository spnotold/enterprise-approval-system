package edu.zju.eas.flow;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;

/** T05 禁止自审、T10 撤回与审批并发、T11 双浏览器同时批准、T12 重复提交幂等、T16 终态不可变 */
class FlowRulesTest extends IntegrationTestBase {

    @Test
    void t05_deptHeadOwnApplicationGoesToFallback() throws Exception {
        long app = submitted("expense", "rd_head_li", expenseBody(List.of(expenseItem(50_000))));
        assertThat(pendingTask(app, "rd_head_li")).isNull();
        assertThat(pendingTask(app, "ceo_zhao")).isNotNull();
        String note = jdbc.queryForObject(
                "SELECT resolve_note FROM flow_node_instance WHERE application_id = ? AND seq = 1", String.class, app);
        assertThat(note).isNotBlank();
        assertThat(data(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/tasks/pending"),
                "rd_head_li", null)).path("total").asInt()).isZero();
    }

    @Test
    void t10_withdrawAndApproveRace() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 20; round++) {
                long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
                int v = version(app);
                Long task = pendingTask(app, "rd_head_li");
                CountDownLatch ready = new CountDownLatch(2), go = new CountDownLatch(1);
                Callable<MvcResult> withdraw = () -> {
                    ready.countDown(); go.await();
                    return action("/applications/" + app + "/withdraw", "rd_emp_wang", map("appVersion", v), key());
                };
                Callable<MvcResult> approve = () -> {
                    ready.countDown(); go.await();
                    return action("/tasks/" + task + "/approve", "rd_head_li", map("appVersion", v, "comment", "同意"), key());
                };
                Future<MvcResult> w = pool.submit(withdraw), a = pool.submit(approve);
                ready.await(); go.countDown();
                List<Integer> statuses = new ArrayList<>(List.of(w.get().getResponse().getStatus(), a.get().getResponse().getStatus()));
                statuses.sort(null);
                assertThat(statuses).as("round %d", round).containsExactly(200, 409);
                String status = status(app);
                long effectiveLogs = jdbc.queryForObject(
                        "SELECT count(*) FROM approval_log WHERE application_id = ? AND action IN ('APPROVE', 'WITHDRAW')", Long.class, app);
                assertThat(effectiveLogs).isEqualTo(1);
                long pending = jdbc.queryForObject(
                        "SELECT count(*) FROM approval_task WHERE application_id = ? AND status = 'PENDING'", Long.class, app);
                assertThat(pending).isZero();
                assertThat(status).isIn("WITHDRAWN", "APPROVED");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void t11_concurrentApproveSameTask() throws Exception {
        long app = submitted("expense", "rd_emp_wang", expenseBody(List.of(expenseItem(200_000))));
        int v = version(app);
        Long task = pendingTask(app, "rd_head_li");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch go = new CountDownLatch(1);
            Callable<MvcResult> approve = () -> {
                go.await();
                return action("/tasks/" + task + "/approve", "rd_head_li", map("appVersion", v, "comment", "同意"), key());
            };
            Future<MvcResult> a = pool.submit(approve), b = pool.submit(approve);
            go.countDown();
            MvcResult ra = a.get(), rb = b.get();
            List<Integer> statuses = new ArrayList<>(List.of(ra.getResponse().getStatus(), rb.getResponse().getStatus()));
            statuses.sort(null);
            assertThat(statuses).containsExactly(200, 409);
            MvcResult loser = ra.getResponse().getStatus() == 409 ? ra : rb;
            assertThat(code(loser)).isIn(40901, 40902);
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM approval_task WHERE application_id = ? AND status = 'PENDING'", Long.class, app))
                    .isEqualTo(1);
            assertThat(pendingTask(app, "fin_auditor_wu")).isNotNull();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void t12_sameIdempotencyKeyReplays() throws Exception {
        long app = draft("travel", "rd_emp_wang", travelBody(100_000));
        String key = key();
        Object body = map("appVersion", version(app));
        MvcResult first = action("/applications/" + app + "/submit", "rd_emp_wang", body, key);
        MvcResult second = action("/applications/" + app + "/submit", "rd_emp_wang", body, key);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(second.getResponse().getContentAsString()).isEqualTo(first.getResponse().getContentAsString());
        assertThat(second.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flow_instance WHERE application_id = ?", Long.class, app)).isEqualTo(1);
        // 同一个键换了请求体
        MvcResult reused = action("/applications/" + app + "/submit", "rd_emp_wang", map("appVersion", 99), key);
        assertThat(code(reused)).isEqualTo(40904);
    }

    @Test
    void t16_finishedApplicationIsImmutable() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");
        assertThat(approve(app, "rd_head_li").getResponse().getStatus()).isEqualTo(200);
        assertThat(status(app)).isEqualTo("APPROVED");
        MvcResult again = action("/tasks/" + task + "/approve", "rd_head_li", map("appVersion", version(app), "comment", "再批"), key());
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat(code(again)).isIn(40901, 40902);
        MvcResult withdraw = action("/applications/" + app + "/withdraw", "rd_emp_wang", map("appVersion", version(app)), key());
        assertThat(withdraw.getResponse().getStatus()).isEqualTo(409);
        assertThat(code(withdraw)).isEqualTo(40901);
    }

    @Test
    void adminTransferWith500CharReasonSucceeds() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");
        String reason = "转".repeat(500);
        MvcResult r = call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/admin/tasks/" + task + "/transfer"),
                "admin", map("toUserId", uid("ceo_zhao"), "reason", reason));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        // 原待办已转办，新待办派给 ceo_zhao
        assertThat(pendingTask(app, "rd_head_li")).isNull();
        assertThat(pendingTask(app, "ceo_zhao")).isNotNull();
        // 日志保留转办双方，超长部分截断，不因拼接前缀超长回滚
        String comment = jdbc.queryForObject(
                "SELECT comment FROM approval_log WHERE application_id = ? AND action = 'TRANSFER'", String.class, app);
        assertThat(comment).startsWith("由 李研 转给 ").endsWith("…").hasSize(500);
    }

    @Test
    void adminTransferKeepsNodeReadableAndAuditsOnce() throws Exception {
        long app = submitted("travel", "rd_emp_wang", travelBody(100_000));
        Long task = pendingTask(app, "rd_head_li");
        MvcResult r = call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/admin/tasks/" + task + "/transfer"),
                "admin", map("toUserId", uid("ceo_zhao"), "reason", "李研出差，转给赵总处理"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
                "SELECT jsonb_typeof(candidate_ids) FROM flow_node_instance WHERE application_id = ? AND seq = 1", String.class, app))
                .isEqualTo("array");
        var get = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/tasks/pending");
        assertThat(data(call(get, "ceo_zhao", null)).path("total").asInt()).isEqualTo(1);
        assertThat(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/applications/" + app),
                "rd_emp_wang", null).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action = 'TASK_TRANSFER'", Long.class)).isEqualTo(1);
        assertThat(approve(app, "ceo_zhao").getResponse().getStatus()).isEqualTo(200);
    }
}

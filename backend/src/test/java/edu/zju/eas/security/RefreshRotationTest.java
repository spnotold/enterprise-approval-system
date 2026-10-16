package edu.zju.eas.security;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.common.Hashes;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Web 端刷新令牌轮换：多个标签页共用同一个 Cookie */
class RefreshRotationTest extends IntegrationTestBase {
    private static final String COOKIE = "eas_rt";

    @Test
    void concurrentRefreshFromTwoTabsKeepsSession() throws Exception {
        String raw = login("rd_emp_wang");
        String hash = Hashes.sha256Hex(raw);
        UUID family = jdbc.queryForObject("SELECT family_id FROM refresh_token WHERE token_hash = ?", UUID.class, hash);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (Connection lock = jdbc.getDataSource().getConnection()) {
            // 先锁住这一行：两个刷新都读到 rotated_at = null，然后都卡在条件更新上；放锁后一个轮换成功，另一个更新 0 行
            lock.setAutoCommit(false);
            try (PreparedStatement ps = lock.prepareStatement("SELECT id FROM refresh_token WHERE token_hash = ? FOR UPDATE")) {
                ps.setString(1, hash);
                ps.executeQuery().close();
            }
            Callable<MvcResult> refresh = () -> refresh(raw, null);
            Future<MvcResult> a = pool.submit(refresh), b = pool.submit(refresh);
            awaitRotationsBlocked(2);
            lock.commit();

            List<MvcResult> results = List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            for (MvcResult r : results) {
                assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
                assertThat(data(r).path("accessToken").asText()).isNotBlank();
            }
            // 先到的写入新 Cookie；后到的不能带清除 Cookie 的响应头，否则会把新 Cookie 删掉
            List<Cookie> cookies = results.stream().map(r -> r.getResponse().getCookie(COOKIE)).toList();
            assertThat(cookies).filteredOn(c -> c != null).hasSize(1);
            Cookie rotated = cookies.stream().filter(c -> c != null).findFirst().orElseThrow();
            assertThat(rotated.getMaxAge()).isPositive();
            assertThat(rotated.getValue()).isNotBlank().isNotEqualTo(raw);

            assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_token WHERE family_id = ? AND revoked_at IS NOT NULL",
                    Long.class, family)).isZero();
            assertThat(refresh(rotated.getValue(), null).getResponse().getStatus()).isEqualTo(200);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void reuseAfterGraceRevokesFamily() throws Exception {
        String raw = login("rd_emp_wang");
        MvcResult first = refresh(raw, null);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        String rotated = first.getResponse().getCookie(COOKIE).getValue();
        jdbc.update("UPDATE refresh_token SET rotated_at = now() - interval '11 seconds' WHERE token_hash = ?",
                Hashes.sha256Hex(raw));

        MvcResult reused = refresh(raw, null);
        assertThat(reused.getResponse().getStatus()).isEqualTo(401);
        assertThat(reused.getResponse().getCookie(COOKIE).getMaxAge()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action = 'REFRESH_TOKEN_REUSE'", Long.class))
                .isEqualTo(1);
        assertThat(refresh(rotated, null).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void otherAccountsCookieIsNotCleared() throws Exception {
        // 另一个标签页已登录 rd_emp_wang；本页仍以 rd_emp_chen 的身份刷新
        String raw = login("rd_emp_wang");
        MvcResult stale = refresh(raw, uid("rd_emp_chen"));
        assertThat(stale.getResponse().getStatus()).isEqualTo(401);
        assertThat(stale.getResponse().getCookie(COOKIE)).isNull();
        assertThat(refresh(raw, uid("rd_emp_wang")).getResponse().getStatus()).isEqualTo(200);
    }

    private String login(String username) throws Exception {
        MvcResult r = call(post("/auth/login"), null, map("account", username, "password", PASSWORD));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return r.getResponse().getCookie(COOKIE).getValue();
    }

    private MvcResult refresh(String raw, Long expectedUserId) throws Exception {
        return call(post("/auth/refresh").cookie(new Cookie(COOKIE, raw)), null,
                expectedUserId == null ? null : map("expectedUserId", expectedUserId));
    }

    /**
     * 等到 n 个刷新请求都卡在轮换的条件更新上（第一个等测试持有的锁，其余排在它后面）。
     * rotated_at 取的是先到请求的事务开始时间，等待须远短于 10 秒宽限，否则后到的会被当成重用。
     */
    private void awaitRotationsBlocked(int n) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
                + " AND wait_event_type = 'Lock' AND query LIKE 'UPDATE refresh_token SET rotated_at%'", Integer.class) < n) {
            assertThat(System.nanoTime()).as("refresh requests never blocked on the row lock").isLessThan(deadline);
            Thread.sleep(20);
        }
    }
}

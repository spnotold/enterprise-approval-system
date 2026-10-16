package edu.zju.eas;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 集成测试使用的 PostgreSQL 16 服务器。
 * 设置了 EAS_TEST_PG_URL / EAS_TEST_PG_USER / EAS_TEST_PG_PASSWORD（可 CREATEDB 的账号）时直接连接该服务器；
 * 否则用 Testcontainers 启动 postgres:16-alpine，整个 JVM 共用一个容器。两者都不可用时测试报错，不会被静默跳过。
 * 每个调用方通过 {@link #createDatabase} 取得一个随机命名的独立库，进程退出时删除，不接触已有业务数据。
 */
public final class TestDatabase {
    private static PostgreSQLContainer<?> container;
    private static String url;
    private static String user;
    private static String password;

    private TestDatabase() {
    }

    private static synchronized void init() {
        if (url != null) return;
        String configured = System.getenv("EAS_TEST_PG_URL");
        if (configured != null && !configured.isBlank()) {
            url = configured;
            user = System.getenv("EAS_TEST_PG_USER");
            password = System.getenv("EAS_TEST_PG_PASSWORD");
        } else {
            container = new PostgreSQLContainer<>("postgres:16-alpine");
            container.start();
            url = container.getJdbcUrl();
            user = container.getUsername();
            password = container.getPassword();
        }
    }

    public static String user() {
        init();
        return user;
    }

    public static String password() {
        init();
        return password;
    }

    /** 新建一个以 prefix 开头、随机后缀的空库，返回它的 JDBC URL */
    public static synchronized String createDatabase(String prefix) {
        init();
        String name = prefix + "_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate admin = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        admin.execute("CREATE DATABASE " + name);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> drop(admin, name)));
        int query = url.indexOf('?');
        String base = query < 0 ? url : url.substring(0, query);
        // 查询参数里的 dbname / PGDBNAME 会覆盖路径中的库名，必须去掉，否则会连到原库
        String params = query < 0 ? "" : Arrays.stream(url.substring(query + 1).split("&"))
                .filter(kv -> !kv.toLowerCase(Locale.ROOT).matches("(dbname|pgdbname)(=.*)?"))
                .collect(Collectors.joining("&"));
        String result = base.substring(0, base.lastIndexOf('/') + 1) + name + (params.isEmpty() ? "" : "?" + params);
        String actual = new JdbcTemplate(new DriverManagerDataSource(result, user, password))
                .queryForObject("SELECT current_database()", String.class);
        if (!name.equals(actual)) {
            throw new IllegalStateException("测试库 URL 未指向新建的临时库 " + name + "，实际连接到 " + actual);
        }
        return result;
    }

    /** 测试类结束时立即删除 {@link #createDatabase} 建的库（调用前先关闭连接池）；进程退出时还会再尝试一次 */
    public static void dropDatabase(String databaseUrl) {
        init();
        int query = databaseUrl.indexOf('?');
        String base = query < 0 ? databaseUrl : databaseUrl.substring(0, query);
        drop(new JdbcTemplate(new DriverManagerDataSource(url, user, password)), base.substring(base.lastIndexOf('/') + 1));
    }

    /**
     * 尽力删除：autovacuum 进程可能短暂连在临时库上，非超级用户无法终止它，稍后重试；
     * 库名带随机后缀，残留（或容器已先退出）不影响下次运行
     */
    private static void drop(JdbcTemplate admin, String name) {
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                admin.execute("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
                return;
            } catch (RuntimeException e) {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }
}

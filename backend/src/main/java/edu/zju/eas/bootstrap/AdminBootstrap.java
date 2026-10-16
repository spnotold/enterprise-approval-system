package edu.zju.eas.bootstrap;

import edu.zju.eas.config.EasProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 非 demo 部署的首个管理员：库中没有任何系统管理员、且配置了 eas.auth.bootstrap-admin-password 时，
 * 创建用户名 admin、归属总经办的系统管理员。之后由管理员在界面上审核注册、分配角色；已有管理员时什么都不做。
 */
@Slf4j
@Component
@Order(0)
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {
    private static final String PASSWORD_RULE = "^(?=.*[A-Za-z])(?=.*\\d).{8,64}$";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final EasProperties props;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String password = props.getAuth().getBootstrapAdminPassword();
        // 多个实例同时首次启动时串行执行，后到者拿到锁后会看到已创建的管理员；事务结束自动释放
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext('eas:admin-bootstrap'))", Object.class);
        Integer admins = jdbc.queryForObject("""
                SELECT count(*) FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE r.code = 'SYS_ADMIN'
                """, Integer.class);
        if (admins != null && admins > 0) return;
        if (password == null || password.isBlank()) {
            log.warn("系统中没有系统管理员；设置环境变量 EAS_ADMIN_PASSWORD 后重启即可创建 admin 账号");
            return;
        }
        if (!password.matches(PASSWORD_RULE)) {
            log.error("EAS_ADMIN_PASSWORD 不符合密码规则（8-64 位，至少包含字母和数字），未创建管理员");
            return;
        }
        Integer taken = jdbc.queryForObject(
                "SELECT count(*) FROM sys_user WHERE lower(username) = 'admin' OR lower(email) = 'admin@eas.local'", Integer.class);
        if (taken != null && taken > 0) {
            log.error("用户名 admin 或邮箱 admin@eas.local 已被非管理员账号占用，未自动创建管理员");
            return;
        }
        Long id = jdbc.queryForObject("""
                INSERT INTO sys_user (username, real_name, email, password_hash, dept_id, status, reviewed_at)
                VALUES ('admin', '系统管理员', 'admin@eas.local', ?,
                        (SELECT id FROM department WHERE code = 'GM' AND deleted_at IS NULL), 'ACTIVE', now())
                RETURNING id
                """, Long.class, passwords.encode(password));
        jdbc.update("INSERT INTO user_role (user_id, role_id) SELECT ?, id FROM role WHERE code = 'SYS_ADMIN'", id);
        jdbc.update("""
                INSERT INTO audit_log (operator_id, operator_name, action, target_type, target_id, reason)
                VALUES (?, '系统', 'ADMIN_BOOTSTRAP', 'USER', ?, '首次启动创建系统管理员')
                """, id, String.valueOf(id));
        log.info("已创建系统管理员 admin，请登录后及时修改密码");
    }
}

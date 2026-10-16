package edu.zju.eas.security;

import edu.zju.eas.IntegrationTestBase;
import edu.zju.eas.bootstrap.AdminBootstrap;
import edu.zju.eas.config.EasProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 非 demo 部署：没有系统管理员时按配置的初始密码创建 admin；已有管理员时不重复创建 */
class AdminBootstrapTest extends IntegrationTestBase {
    @Autowired AdminBootstrap bootstrap;
    @Autowired EasProperties props;

    @AfterEach
    void clearPassword() {
        props.getAuth().setBootstrapAdminPassword(null);
    }

    private long adminCount() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE r.code = 'SYS_ADMIN'", Long.class);
    }

    @Test
    void createsFirstAdminOnlyWhenNoneExists() throws Exception {
        props.getAuth().setBootstrapAdminPassword("Bootstrap2026");
        bootstrap.run(null);
        assertThat(adminCount()).isEqualTo(1);   // 演示库已有 admin，不重复创建

        jdbc.update("DELETE FROM user_role WHERE role_id = (SELECT id FROM role WHERE code = 'SYS_ADMIN')");
        jdbc.update("UPDATE sys_user SET username = 'old_admin', email = 'old_admin@eas.local' WHERE username = 'admin'");
        bootstrap.run(null);
        assertThat(adminCount()).isEqualTo(1);
        authInfo.evictAll();
        MvcResult login = call(post("/auth/login"), null, map("account", "admin", "password", "Bootstrap2026"));
        assertThat(login.getResponse().getStatus()).as(login.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action = 'ADMIN_BOOTSTRAP'", Long.class)).isEqualTo(1);
    }

    @Test
    void weakPasswordIsRefused() throws Exception {
        jdbc.update("DELETE FROM user_role WHERE role_id = (SELECT id FROM role WHERE code = 'SYS_ADMIN')");
        jdbc.update("UPDATE sys_user SET username = 'old_admin', email = 'old_admin@eas.local' WHERE username = 'admin'");
        props.getAuth().setBootstrapAdminPassword("short");
        bootstrap.run(null);
        assertThat(adminCount()).isZero();
    }
}

package edu.zju.eas.service.admin;

import edu.zju.eas.response.BizException;
import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;

/** 本模块的写锁与提交后失效处理；锁不跨事务持有。 */
@Component
@RequiredArgsConstructor
public class AdminSupport {
    private final JdbcTemplate jdbc;
    private final AuthInfoService auth;

    public static CurrentUser require(String permission) {
        CurrentUser u = SecurityUtils.currentOrNull();
        if (u == null || !u.has(permission)) throw BizException.forbidden();
        return u;
    }

    /** 组织写操作与发布共享此锁，避免负责人/主办人调整和发布校验互相穿透。 */
    public void lock() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("写操作必须在事务内");
        jdbc.query("SELECT pg_advisory_xact_lock(537593, 1)", rs -> { });
    }

    public void invalidate(Long userId, boolean revokeRefresh) {
        jdbc.update("UPDATE sys_user SET token_version=token_version+1 WHERE id=?", userId);
        if (revokeRefresh) jdbc.update("UPDATE refresh_token SET revoked_at=now() WHERE user_id=? AND revoked_at IS NULL", userId);
        invalidateCaches();
    }

    public void invalidateCaches() {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { auth.evictAll(); }
        });
    }

    public static String reason(String value, String defaultReason) {
        if (value == null || value.isBlank()) return defaultReason;
        if (value.trim().length() > 500) throw BizException.rule("reason", "REASON_INVALID", "原因不能超过500字");
        return value.trim();
    }
    public static String requiredReason(String value) {
        if (value == null || value.isBlank()) throw BizException.rule("reason", "REASON_REQUIRED", "请填写操作原因");
        return reason(value, null);
    }
    public static int page(int page) { return Math.max(1, page); }
    public static int size(int size) { return Math.min(100, Math.max(1, size)); }
    public static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class);
    }
    public static Long id(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, Long.class);
    }
}

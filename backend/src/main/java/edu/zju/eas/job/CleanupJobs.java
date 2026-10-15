package edu.zju.eas.job;

import edu.zju.eas.service.file.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/**
 * 清理类定时任务：过期 TEMP 附件、幂等记录、软删草稿、过期刷新令牌。
 * 先在数据库里按条件改状态 / 删除行（与绑定、恢复等操作互斥），提交后再删 MinIO 对象，
 * 对象删除失败只留下孤儿文件，不会出现记录指向不存在的对象。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CleanupJobs {
    static final int TEMP_ATTACHMENT_HOURS = 24;
    static final int IDEMPOTENCY_KEEP_DAYS = 7;
    static final int DELETED_DRAFT_KEEP_DAYS = 30;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final StorageService storage;

    /** 超过 24 小时仍未绑定到申请的 TEMP 附件 */
    @Scheduled(cron = "0 15 * * * *", zone = "Asia/Shanghai")
    public int purgeTempAttachments() {
        List<String> keys = jdbc.queryForList("""
                UPDATE attachment SET status = 'DELETED', deleted_at = now()
                 WHERE status = 'TEMP' AND updated_at < now() - make_interval(hours => ?)
                RETURNING storage_key
                """, String.class, TEMP_ATTACHMENT_HOURS);
        removeObjects(keys);
        if (!keys.isEmpty()) log.info("purged {} temp attachments", keys.size());
        return keys.size();
    }

    /** 幂等记录只用于短时间内的重试与重复点击，保留 7 天 */
    @Scheduled(cron = "0 20 3 * * *", zone = "Asia/Shanghai")
    public int purgeIdempotencyRecords() {
        return jdbc.update("DELETE FROM idempotency_record WHERE created_at < now() - make_interval(days => ?)",
                IDEMPOTENCY_KEEP_DAYS);
    }

    /** 物理删除 30 天前软删的草稿：明细随 CASCADE 删除，附件先标记删除再删对象 */
    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Shanghai")
    public int purgeDeletedDrafts() {
        record Purged(int count, List<String> keys) {}
        Purged purged = tx.execute(s -> {
            List<Long> ids = jdbc.queryForList("""
                    SELECT a.id FROM application a
                     WHERE a.status = 'DRAFT' AND a.deleted_at < now() - make_interval(days => ?)
                       AND NOT EXISTS (SELECT 1 FROM flow_instance f WHERE f.application_id = a.id)
                       AND NOT EXISTS (SELECT 1 FROM application c WHERE c.source_application_id = a.id)
                       AND NOT EXISTS (SELECT 1 FROM expense_relation r WHERE r.related_application_id = a.id)
                     ORDER BY a.id LIMIT 500
                     FOR UPDATE SKIP LOCKED
                    """, Long.class, DELETED_DRAFT_KEEP_DAYS);
            if (ids.isEmpty()) return new Purged(0, List.of());
            Long[] arr = ids.toArray(Long[]::new);
            List<String> keys = jdbc.queryForList("""
                    UPDATE attachment SET status = 'DELETED', deleted_at = now()
                     WHERE application_id = ANY(?) AND status <> 'DELETED'
                    RETURNING storage_key
                    """, String.class, (Object) arr);
            jdbc.update("DELETE FROM notification WHERE application_id = ANY(?)", (Object) arr);
            int n = jdbc.update("DELETE FROM application WHERE id = ANY(?)", (Object) arr);
            return new Purged(n, keys);
        });
        removeObjects(purged.keys());
        if (purged.count() > 0) log.info("purged {} deleted drafts", purged.count());
        return purged.count();
    }

    /** 过期超过一天的刷新令牌（留一天便于排查刚过期的会话） */
    @Scheduled(cron = "0 40 3 * * *", zone = "Asia/Shanghai")
    public int purgeRefreshTokens() {
        return jdbc.update("DELETE FROM refresh_token WHERE expires_at < now() - interval '1 day'");
    }

    private void removeObjects(List<String> keys) {
        for (String key : keys) {
            try {
                storage.remove(key);
            } catch (RuntimeException e) {
                log.warn("failed to remove object {}: {}", key, e.getMessage());
            }
        }
    }
}

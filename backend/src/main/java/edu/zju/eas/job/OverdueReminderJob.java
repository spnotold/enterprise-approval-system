package edu.zju.eas.job;

import edu.zju.eas.model.app.Application;
import edu.zju.eas.repository.ApplicationMapper;
import edu.zju.eas.service.SysConfigService;
import edu.zju.eas.service.notify.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 每 30 分钟扫描超过时限仍未处理的待办，给当前审批人发 TASK_OVERDUE 站内通知和邮件。
 * 时限取节点 timeout_hours，未配置时用系统配置 task.overdue_hours；
 * 去重键含任务 ID 和日期，同一待办每天最多提醒一次。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OverdueReminderJob {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ApplicationMapper applicationMapper;
    private final NotificationService notifications;
    private final SysConfigService config;
    private final Clock clock;

    record Overdue(long taskId, long applicationId, long assigneeId, long pendingHours) {}

    @Scheduled(fixedDelay = 30 * 60_000L, initialDelay = 60_000L)
    public int remind() {
        int defaultHours = Math.max(1, config.getInt(SysConfigService.TASK_OVERDUE_HOURS, 48));
        String day = LocalDate.now(clock.withZone(ZONE)).toString();
        var rows = jdbc.query("""
                SELECT t.id, t.application_id, t.assignee_id,
                       floor(extract(epoch FROM now() - t.created_at) / 3600)::bigint AS hours
                  FROM approval_task t
                  JOIN flow_node_instance n ON n.id = t.node_instance_id
                  JOIN application a ON a.id = t.application_id
                 WHERE t.status = 'PENDING' AND n.status = 'ACTIVE' AND a.status = 'IN_APPROVAL'
                   AND t.created_at < now() - make_interval(hours => COALESCE(n.timeout_hours, ?))
                 ORDER BY t.id
                """, (r, i) -> new Overdue(r.getLong(1), r.getLong(2), r.getLong(3), r.getLong(4)), defaultHours);
        int sent = 0;
        for (Overdue o : rows) {
            try {
                Boolean ok = tx.execute(s -> {
                    Application app = applicationMapper.selectById(o.applicationId());
                    if (app == null) return false;
                    return notifications.overdue(app, o.taskId(), o.assigneeId(), day, o.pendingHours());
                });
                if (Boolean.TRUE.equals(ok)) sent++;
            } catch (RuntimeException e) {
                log.warn("overdue reminder for task {} failed: {}", o.taskId(), e.getMessage());
            }
        }
        if (sent > 0) log.info("sent {} overdue reminders", sent);
        return sent;
    }
}

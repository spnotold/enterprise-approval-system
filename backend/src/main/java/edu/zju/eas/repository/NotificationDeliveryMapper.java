package edu.zju.eas.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import edu.zju.eas.model.common.NotificationDelivery;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;

import java.time.OffsetDateTime;
import java.util.List;

@Mapper
public interface NotificationDeliveryMapper extends BaseMapper<NotificationDelivery> {

    /** 待发邮件及其展示信息 */
    record PendingMail(Long id, Long notificationId, String recipientEmail, Integer attempts, String title,
                       String content, String linkPath, OffsetDateTime createdAt, String appNo, String appType,
                       String appStatus) {
    }

    /** 取一批待发记录并加锁；多实例部署时互不重复 */
    @Select("""
            SELECT d.id, d.notification_id, d.recipient_email, d.attempts, n.title, n.content, n.link_path,
                   n.created_at, a.app_no, a.type AS app_type, a.status AS app_status
              FROM notification_delivery d
              JOIN notification n ON n.id = d.notification_id
              LEFT JOIN application a ON a.id = n.application_id
             WHERE d.status = 'PENDING' AND d.next_retry_at <= now()
             ORDER BY d.next_retry_at
             LIMIT 50
               FOR UPDATE OF d SKIP LOCKED
            """)
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    List<PendingMail> lockPending();
}

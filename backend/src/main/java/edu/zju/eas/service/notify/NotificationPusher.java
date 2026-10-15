package edu.zju.eas.service.notify;

import edu.zju.eas.repository.NotificationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class NotificationPusher {
    private final SseHub hub;
    private final NotificationMapper notificationMapper;

    /** 推送在事务提交之后进行，事务回滚就不会推送；推送只是提醒，数据以接口查询为准 */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(NotificationCreated e) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", e.id());
        payload.put("type", e.type());
        payload.put("title", e.title());
        payload.put("linkPath", e.linkPath());
        payload.put("applicationId", e.applicationId());
        payload.put("unreadCount", notificationMapper.unreadCount(e.recipientId()));
        hub.send(e.recipientId(), "notification", payload);
    }
}

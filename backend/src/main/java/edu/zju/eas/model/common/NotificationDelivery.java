package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("notification_delivery")
public class NotificationDelivery {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long notificationId;
    private String channel;
    private String recipientEmail;
    private String status;
    private Integer attempts;
    private OffsetDateTime nextRetryAt;
    private String lastError;
    private OffsetDateTime sentAt;
    private OffsetDateTime createdAt;
}

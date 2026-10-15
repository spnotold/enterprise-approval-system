package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("notification")
public class Notification {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long recipientId;
    private String type;
    private String title;
    private String content;
    private Long applicationId;
    private String linkPath;
    private String dedupKey;
    private Boolean isRead;
    private OffsetDateTime readAt;
    private OffsetDateTime createdAt;
}

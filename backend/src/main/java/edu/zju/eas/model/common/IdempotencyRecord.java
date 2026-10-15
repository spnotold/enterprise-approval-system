package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("idempotency_record")
public class IdempotencyRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String idemKey;
    private String requestHash;
    private String endpoint;
    private String status;
    private Integer responseCode;
    private String responseBody;
    private OffsetDateTime createdAt;
    private OffsetDateTime completedAt;
}

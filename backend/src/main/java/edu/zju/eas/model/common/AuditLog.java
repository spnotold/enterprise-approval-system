package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "audit_log", autoResultMap = true)
public class AuditLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long operatorId;
    private String operatorName;
    private String action;
    private String targetType;
    private String targetId;
    @TableField(typeHandler = JsonbHandlers.JsonNodeHandler.class)
    private JsonNode beforeData;
    @TableField(typeHandler = JsonbHandlers.JsonNodeHandler.class)
    private JsonNode afterData;
    private String reason;
    private String ip;
    private OffsetDateTime createdAt;
}

package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "flow_instance", autoResultMap = true)
public class FlowInstance {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Long templateId;
    private Long templateVersionId;
    private Integer versionNo;
    @TableField(typeHandler = JsonbHandlers.JsonNodeHandler.class)
    private JsonNode snapshot;
    private OffsetDateTime createdAt;
}

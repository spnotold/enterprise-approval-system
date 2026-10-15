package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("urge_record")
public class UrgeRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long nodeInstanceId;
    private Long applicationId;
    private Long urgedBy;
    private Long timeBucket;
    private OffsetDateTime createdAt;
}

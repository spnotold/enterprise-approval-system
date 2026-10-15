package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("sys_config")
public class SysConfig {
    @TableId(type = IdType.INPUT)
    private String configKey;
    private String configValue;
    private String description;
    private Long updatedBy;
    private OffsetDateTime updatedAt;
}

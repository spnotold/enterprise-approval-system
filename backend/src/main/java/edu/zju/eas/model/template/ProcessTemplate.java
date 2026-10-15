package edu.zju.eas.model.template;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("process_template")
public class ProcessTemplate {
    public static final String BUILTIN = "BUILTIN";
    public static final String CUSTOM = "CUSTOM";

    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String description;
    private String category;
    private String bizType;
    private Boolean enabled;
    private Long currentVersionId;
    private Integer sortOrder;
    private Long createdBy;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}

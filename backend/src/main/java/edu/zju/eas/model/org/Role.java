package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("role")
public class Role {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String description;
    private Boolean builtin;
    private Integer sortOrder;
    private OffsetDateTime createdAt;
}

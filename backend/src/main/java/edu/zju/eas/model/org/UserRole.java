package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("user_role")
public class UserRole {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long roleId;
    @TableField("is_primary_handler")
    private Boolean primaryHandler;
    private Long grantedBy;
    private OffsetDateTime createdAt;
}

package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("data_scope_grant")
public class DataScopeGrant {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String permissionCode;
    private String scopeType;
    private Long deptId;
    private OffsetDateTime validFrom;
    private OffsetDateTime validUntil;
    private String reason;
    private Long grantedBy;
    private OffsetDateTime createdAt;
    private OffsetDateTime revokedAt;
    private Long revokedBy;
    private String revokeReason;
}

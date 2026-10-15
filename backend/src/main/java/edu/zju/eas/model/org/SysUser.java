package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("sys_user")
public class SysUser {
    public static final String PENDING = "PENDING";
    public static final String ACTIVE = "ACTIVE";
    public static final String DISABLED = "DISABLED";
    public static final String REJECTED = "REJECTED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    private String realName;
    private String email;
    private String passwordHash;
    private Long deptId;
    private Long requestedDeptId;
    private String status;
    private Integer tokenVersion;
    private Integer failedLoginCount;
    private OffsetDateTime firstFailedAt;
    private OffsetDateTime lockedUntil;
    private Boolean emailNotify;
    private OffsetDateTime lastLoginAt;
    private Long reviewedBy;
    private OffsetDateTime reviewedAt;
    private String reviewNote;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public boolean isLocked(java.time.Clock clock) {
        return lockedUntil != null && lockedUntil.toInstant().isAfter(clock.instant());
    }
}

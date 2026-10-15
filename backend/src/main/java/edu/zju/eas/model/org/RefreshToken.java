package edu.zju.eas.model.org;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@TableName("refresh_token")
public class RefreshToken {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String tokenHash;
    private UUID familyId;
    private String client;
    private OffsetDateTime expiresAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime rotatedAt;
    private OffsetDateTime revokedAt;
    private String userAgent;
    private String ip;
}

package edu.zju.eas.model.common;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("attachment")
public class Attachment {
    public static final String TEMP = "TEMP";
    public static final String BOUND = "BOUND";
    public static final String DELETED = "DELETED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long uploaderId;
    private Long applicationId;
    private String refType;
    private String originalName;
    private String storageKey;
    private String contentType;
    private Long sizeBytes;
    private String sha256;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private OffsetDateTime boundAt;
    private OffsetDateTime deletedAt;
}

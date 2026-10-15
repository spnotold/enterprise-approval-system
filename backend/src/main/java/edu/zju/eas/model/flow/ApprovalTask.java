package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("approval_task")
public class ApprovalTask {
    public static final String PENDING = "PENDING";
    public static final String APPROVED = "APPROVED";
    public static final String REJECTED = "REJECTED";
    public static final String CANCELED = "CANCELED";
    public static final String TRANSFERRED = "TRANSFERRED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Long nodeInstanceId;
    private Long assigneeId;
    private String status;
    private String comment;
    private OffsetDateTime createdAt;
    private OffsetDateTime actedAt;
}

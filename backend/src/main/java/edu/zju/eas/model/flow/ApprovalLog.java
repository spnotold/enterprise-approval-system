package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("approval_log")
public class ApprovalLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Long nodeInstanceId;
    private Long taskId;
    private String nodeName;
    private Long operatorId;
    private String operatorName;
    private String action;
    private String comment;
    private String fromStatus;
    private String toStatus;
    private Integer appVersion;
    private Integer templateVersionNo;
    private String ip;
    private OffsetDateTime createdAt;
}

package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@TableName("assignee_history")
public class AssigneeHistory {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long nodeInstanceId;
    private Long fromTaskId;
    private Long toTaskId;
    private Long fromUserId;
    private Long toUserId;
    private String reason;
    private Long operatorId;
    private OffsetDateTime createdAt;
}

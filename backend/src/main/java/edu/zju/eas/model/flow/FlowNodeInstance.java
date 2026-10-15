package edu.zju.eas.model.flow;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.List;
import edu.zju.eas.common.mybatis.JsonbHandlers;
import edu.zju.eas.model.template.*;

@Data
@TableName(value = "flow_node_instance", autoResultMap = true)
public class FlowNodeInstance {
    public static final String WAITING = "WAITING";
    public static final String ACTIVE = "ACTIVE";
    public static final String APPROVED = "APPROVED";
    public static final String REJECTED = "REJECTED";
    public static final String CANCELED = "CANCELED";
    public static final String SKIPPED = "SKIPPED";
    public static final String NOT_REACHED = "NOT_REACHED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long flowInstanceId;
    private Long applicationId;
    private Integer seq;
    private String nodeKey;
    private String name;
    private String mode;
    private String status;
    @TableField(typeHandler = JsonbHandlers.ApproverRuleHandler.class)
    private ApproverRule approverRule;
    @TableField(typeHandler = JsonbHandlers.ConditionHandler.class)
    private Condition conditionExpr;
    private Boolean conditionResult;
    private Boolean effective;
    private Long assigneeId;
    @TableField(typeHandler = JsonbHandlers.LongListHandler.class)
    private List<Long> candidateIds;
    private String resolveNote;
    private Integer requiredCount;
    private Integer approvedCount;
    private Integer timeoutHours;
    private OffsetDateTime activatedAt;
    private OffsetDateTime finishedAt;
    private OffsetDateTime createdAt;
}

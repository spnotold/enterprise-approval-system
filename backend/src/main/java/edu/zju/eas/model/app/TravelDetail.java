package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.OffsetDateTime;
import java.math.BigDecimal;
import java.util.List;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "travel_detail", autoResultMap = true)
public class TravelDetail {
    @TableId(type = IdType.INPUT)
    private Long applicationId;
    private String origin;
    private String destination;
    private OffsetDateTime startTime;
    private OffsetDateTime endTime;
    private Integer naturalDays;
    private BigDecimal durationHours;
    private String transport;
    private String purpose;
    private Long budgetCents;
    @TableField(typeHandler = JsonbHandlers.LongListHandler.class)
    private List<Long> attachmentIds;
}

package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "purchase_detail", autoResultMap = true)
public class PurchaseDetail {
    @TableId(type = IdType.INPUT)
    private Long applicationId;
    private String reason;
    private Long budgetLimitCents;
    private java.time.LocalDate expectedArrivalDate;
    private Boolean singleSource;
    private String singleSourceReason;
    @TableField(typeHandler = JsonbHandlers.LongListHandler.class)
    private List<Long> singleSourceAttachmentIds;
    private Long selectedQuoteId;
    private String selectionReason;
    private String notLowestReason;
    @TableField(typeHandler = JsonbHandlers.LongListHandler.class)
    private List<Long> attachmentIds;
    private Long itemsTotalCents;
}

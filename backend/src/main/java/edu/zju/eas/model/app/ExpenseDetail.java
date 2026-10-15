package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("expense_detail")
public class ExpenseDetail {
    @TableId(type = IdType.INPUT)
    private Long applicationId;
    private String description;
    private String independentReason;
    private Long totalAmountCents;
}

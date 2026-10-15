package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;

@Data
@TableName("purchase_item")
public class PurchaseItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Integer seq;
    private String name;
    private String spec;
    private String unit;
    private BigDecimal quantity;
    private Long unitPriceCents;
    private Long amountCents;
    private String remark;
}

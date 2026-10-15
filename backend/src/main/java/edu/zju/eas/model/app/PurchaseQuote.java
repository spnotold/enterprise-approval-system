package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.util.List;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "purchase_quote", autoResultMap = true)
public class PurchaseQuote {
    public static final String ONLINE = "ONLINE";
    public static final String OFFLINE = "OFFLINE";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Integer seq;
    private String supplierName;
    private String channel;
    private Long quoteAmountCents;
    private String url;
    private String description;
    @TableField(typeHandler = JsonbHandlers.LongListHandler.class)
    private List<Long> attachmentIds;
}

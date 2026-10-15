package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("expense_invoice")
public class ExpenseInvoice {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Long expenseItemId;
    private Integer seq;
    private Long attachmentId;
    private String fileSha256;
    private String invoiceNo;
    private String invoiceNoNorm;
}

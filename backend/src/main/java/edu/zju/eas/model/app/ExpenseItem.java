package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;

@Data
@TableName("expense_item")
public class ExpenseItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Integer seq;
    private Long expenseTypeId;
    private java.time.LocalDate occurDate;
    private String purpose;
    private Long amountCents;
    private Boolean noInvoice;
    private String noInvoiceReason;
}

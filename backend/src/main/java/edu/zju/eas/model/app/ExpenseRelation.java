package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("expense_relation")
public class ExpenseRelation {
    private Long expenseApplicationId;
    private Long relatedApplicationId;
}

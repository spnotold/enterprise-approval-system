package edu.zju.eas.model.app;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import com.fasterxml.jackson.databind.JsonNode;
import edu.zju.eas.common.mybatis.JsonbHandlers;

@Data
@TableName(value = "custom_form_data", autoResultMap = true)
public class CustomFormData {
    @TableId(type = IdType.INPUT)
    private Long applicationId;
    private Long templateVersionId;
    @TableField(typeHandler = JsonbHandlers.JsonNodeHandler.class)
    private JsonNode formValues;
}

package edu.zju.eas.model.template;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

@Data
@TableName("process_template_dept")
public class ProcessTemplateDept {
    private Long templateId;
    private Long deptId;
}

package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 模板表单定义（process_template_version.form_schema）。内置模板 builtin 非空，表单固定 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FormSchema {
    private String builtin;
    private List<FormField> fields = new ArrayList<>();
}

package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConditionRule {
    public static final List<String> OPS = List.of("EQ", "NE", "GT", "GTE", "LT", "LTE", "IN");

    private String var;
    private String op;
    private String value;
    private List<String> values;
}

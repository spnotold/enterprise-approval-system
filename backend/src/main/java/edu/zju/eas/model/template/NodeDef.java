package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class NodeDef {
    public static final String SINGLE = "SINGLE";
    public static final String COUNTERSIGN = "COUNTERSIGN";
    public static final String OR_SIGN = "OR_SIGN";

    private String nodeKey;
    private String name;
    private ApproverRule approverRule;
    private ApproverRule fallbackRule;
    private Condition condition;
    private String mode;
    private Integer timeoutHours;

    public String modeOrDefault() {
        return mode == null || mode.isBlank() ? SINGLE : mode;
    }
}

package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FormField {
    public static final String TEXT = "TEXT";
    public static final String TEXTAREA = "TEXTAREA";
    public static final String NUMBER = "NUMBER";
    public static final String AMOUNT = "AMOUNT";
    public static final String DATE = "DATE";
    public static final String RADIO = "RADIO";
    public static final String ATTACHMENT = "ATTACHMENT";
    public static final List<String> TYPES = List.of(TEXT, TEXTAREA, NUMBER, AMOUNT, DATE, RADIO, ATTACHMENT);

    private String key;
    private String label;
    private String type;
    private Boolean required;
    private String placeholder;
    private String help;
    private List<FieldOption> options;
    private FieldRules rules;
    private Boolean statAmount;

    public boolean isRequired() {
        return Boolean.TRUE.equals(required);
    }

    public boolean isStatAmount() {
        return Boolean.TRUE.equals(statAmount);
    }

    public FieldRules rulesOrEmpty() {
        return rules == null ? new FieldRules() : rules;
    }
}

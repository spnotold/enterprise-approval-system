package edu.zju.eas.model.template;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

/** 字段校验规则，适用的项由字段类型决定 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FieldRules {
    // TEXT / TEXTAREA
    private Integer minLength;
    private Integer maxLength;
    private String patternPreset;   // MOBILE / EMAIL
    private String pattern;
    private String patternMessage;
    // NUMBER：十进制字符串
    private String min;
    private String max;
    private Integer precision;      // 0-4
    private String step;
    // AMOUNT：整数分
    private Long minCents;
    private Long maxCents;
    // DATE：YYYY-MM-DD、TODAY、TODAY+30、TODAY-7
    private String earliest;
    private String latest;
    private String notBefore;       // 另一个 DATE 字段的 key
    // ATTACHMENT
    private Integer maxCount;
    private List<String> allowedTypes;
    private Integer maxSizeMb;
}

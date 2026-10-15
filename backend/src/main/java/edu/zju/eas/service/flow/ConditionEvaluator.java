package edu.zju.eas.service.flow;

import edu.zju.eas.model.template.Condition;
import edu.zju.eas.model.template.ConditionRule;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 节点条件求值。变量取值类型：金额 / 系统变量为 Long，数字字段为 BigDecimal，日期为 LocalDate，单选为 String。
 * 变量缺失或值无法比较时该条规则不成立。
 */
@Component
public class ConditionEvaluator {
    private static final Map<String, String> OP_TEXT = Map.of(
            "EQ", "=", "NE", "≠", "GT", ">", "GTE", "≥", "LT", "<", "LTE", "≤", "IN", "属于");

    public boolean evaluate(Condition c, Map<String, Object> vars) {
        if (c == null || c.getRules() == null || c.getRules().isEmpty()) {
            return true;
        }
        boolean or = "OR".equalsIgnoreCase(c.getLogic());
        for (ConditionRule r : c.getRules()) {
            boolean ok = test(r, vars.get(r.getVar()));
            if (or && ok) {
                return true;
            }
            if (!or && !ok) {
                return false;
            }
        }
        return !or;
    }

    boolean test(ConditionRule r, Object actual) {
        if (actual == null || r.getOp() == null) {
            return false;
        }
        String op = r.getOp();
        if ("IN".equals(op)) {
            List<String> values = r.getValues() != null ? r.getValues()
                    : r.getValue() == null ? List.of() : List.of(r.getValue().split(","));
            return values.stream().map(String::trim).anyMatch(v -> compare(actual, v) == 0);
        }
        Integer cmp = compare(actual, r.getValue());
        if (cmp == null) {
            return false;
        }
        return switch (op) {
            case "EQ" -> cmp == 0;
            case "NE" -> cmp != 0;
            case "GT" -> cmp > 0;
            case "GTE" -> cmp >= 0;
            case "LT" -> cmp < 0;
            case "LTE" -> cmp <= 0;
            default -> false;
        };
    }

    /** 返回 actual 与 expected 的比较结果；无法比较时为 null */
    private static Integer compare(Object actual, String expected) {
        if (expected == null) {
            return null;
        }
        try {
            if (actual instanceof Number n) {
                BigDecimal a = n instanceof BigDecimal b ? b : new BigDecimal(n.toString());
                return a.compareTo(new BigDecimal(expected.trim()));
            }
            if (actual instanceof LocalDate d) {
                return d.compareTo(LocalDate.parse(expected.trim()));
            }
            String s = actual.toString();
            return s.equals(expected.trim()) ? 0 : (s.compareTo(expected.trim()) > 0 ? 1 : -1);
        } catch (NumberFormatException | DateTimeParseException e) {
            return null;
        }
    }

    /** 条件的中文说明，如“金额 ≥ 10,000.00 元” */
    public String describe(Condition c, Map<String, String> labels) {
        if (c == null || c.getRules() == null || c.getRules().isEmpty()) {
            return null;
        }
        String joiner = "OR".equalsIgnoreCase(c.getLogic()) ? " 或 " : " 且 ";
        return c.getRules().stream().map(r -> describe(r, labels)).collect(Collectors.joining(joiner));
    }

    private static String describe(ConditionRule r, Map<String, String> labels) {
        String var = r.getVar();
        String name = labels.getOrDefault(var, var);
        String op = OP_TEXT.getOrDefault(r.getOp(), r.getOp());
        String value;
        if ("IN".equals(r.getOp())) {
            value = String.join("、", r.getValues() == null ? List.of(String.valueOf(r.getValue())) : r.getValues());
        } else if (var != null && (var.equals("amountCents") || labels.getOrDefault(var + "#type", "").equals("AMOUNT"))) {
            value = yuan(r.getValue()) + " 元";
        } else if ("naturalDays".equals(var)) {
            value = r.getValue() + " 天";
        } else {
            value = r.getValue();
        }
        return name + " " + op + " " + value;
    }

    private static String yuan(String cents) {
        try {
            BigDecimal y = new BigDecimal(cents).divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY);
            return String.format("%,.2f", y);
        } catch (RuntimeException e) {
            return cents;
        }
    }
}

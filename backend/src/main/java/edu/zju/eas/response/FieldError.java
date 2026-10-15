package edu.zju.eas.response;

/** 字段级错误，field 可定位到明细行，如 items[2].amountCents */
public record FieldError(String field, String rule, String message) {
}

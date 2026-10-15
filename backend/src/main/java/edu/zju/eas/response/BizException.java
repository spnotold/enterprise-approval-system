package edu.zju.eas.response;

import java.util.List;

/** 业务异常，由 GlobalExceptionHandler 转换为 ApiResponse */
public class BizException extends RuntimeException {
    private final ErrorCode errorCode;
    private final List<FieldError> errors;

    public BizException(ErrorCode errorCode) {
        this(errorCode, null, List.of());
    }

    public BizException(ErrorCode errorCode, String message) {
        this(errorCode, message, List.of());
    }

    public BizException(ErrorCode errorCode, String message, List<FieldError> errors) {
        super(message != null ? message : errorCode.message());
        this.errorCode = errorCode;
        this.errors = errors == null ? List.of() : List.copyOf(errors);
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public List<FieldError> errors() {
        return errors;
    }

    /** 422 业务规则错误，单字段 */
    public static BizException rule(String field, String rule, String message) {
        return new BizException(ErrorCode.BIZ_RULE, message, List.of(new FieldError(field, rule, message)));
    }

    public static BizException notFound() {
        return new BizException(ErrorCode.NOT_FOUND);
    }

    public static BizException forbidden() {
        return new BizException(ErrorCode.FORBIDDEN);
    }

    public static BizException stateChanged() {
        return new BizException(ErrorCode.STATE_CHANGED);
    }
}

package edu.zju.eas.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import edu.zju.eas.common.TraceContext;

import java.util.List;

/** 统一响应格式 {code, message, data, traceId, errors} */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(
        int code,           // 0 表示成功，其余见 ErrorCode
        String message,
        T data,
        String traceId,     // 与日志中的 traceId 对应，便于排查
        List<FieldError> errors
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, "OK", data, TraceContext.id(), null);
    }

    public static ApiResponse<Void> ok() {
        return ok(null);
    }

    public static ApiResponse<Void> fail(ErrorCode ec, String message, List<FieldError> errors) {
        return new ApiResponse<>(ec.code(), message != null ? message : ec.message(), null,
                TraceContext.id(), errors == null || errors.isEmpty() ? null : errors);
    }

    public static ApiResponse<Void> fail(ErrorCode ec) {
        return fail(ec, null, null);
    }
}

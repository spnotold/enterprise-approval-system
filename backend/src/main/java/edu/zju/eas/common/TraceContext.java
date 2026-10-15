package edu.zju.eas.common;

import org.slf4j.MDC;

/** 请求级 traceId，写入 MDC 与响应头，与 ApiResponse.traceId 对应 */
public final class TraceContext {
    public static final String KEY = "traceId";

    private TraceContext() {
    }

    public static String id() {
        return MDC.get(KEY);
    }
}

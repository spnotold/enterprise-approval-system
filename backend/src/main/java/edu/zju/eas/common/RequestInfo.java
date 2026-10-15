package edu.zju.eas.common;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 当前请求的客户端信息（IP、UA） */
public final class RequestInfo {
    private RequestInfo() {
    }

    public static HttpServletRequest current() {
        var attrs = RequestContextHolder.getRequestAttributes();
        return attrs instanceof ServletRequestAttributes s ? s.getRequest() : null;
    }

    /**
     * Nginx 用 $remote_addr 覆盖 X-Real-IP，客户端无法伪造；直连（开发环境）时取 remoteAddr。
     * 不取 X-Forwarded-For 的第一段，因为它可以由客户端随意填写。
     */
    public static String ip() {
        HttpServletRequest req = current();
        if (req == null) {
            return null;
        }
        String real = req.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) {
            return real.trim();
        }
        return req.getRemoteAddr();
    }

    public static String userAgent() {
        HttpServletRequest req = current();
        if (req == null) {
            return null;
        }
        String ua = req.getHeader("User-Agent");
        return ua == null ? null : ua.substring(0, Math.min(300, ua.length()));
    }
}

package edu.zju.eas.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {
    private SecurityUtils() {
    }

    /** 当前登录用户；未登录（如定时任务、公开接口）返回 null */
    public static CurrentUser currentOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof CurrentUser u ? u : null;
    }
}

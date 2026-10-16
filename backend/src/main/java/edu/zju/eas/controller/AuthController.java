package edu.zju.eas.controller;

import edu.zju.eas.common.RequestInfo;
import edu.zju.eas.config.EasProperties;
import edu.zju.eas.dto.auth.LoginRequest;
import edu.zju.eas.dto.auth.LoginResult;
import edu.zju.eas.dto.auth.RefreshRequest;
import edu.zju.eas.dto.auth.RegisterRequest;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.security.RateLimiter;
import edu.zju.eas.service.AuthService;
import edu.zju.eas.service.notify.SseTicketService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/auth")   // 实际路径 /api/auth
@RequiredArgsConstructor
public class AuthController {
    /** Web 端刷新令牌 Cookie：HttpOnly; SameSite=Strict; Path=/api/auth */
    static final String REFRESH_COOKIE = "eas_rt";
    private static final String COOKIE_PATH = "/api/auth";

    private final AuthService authService;
    private final SseTicketService sseTicketService;
    private final RateLimiter rateLimiter;
    private final EasProperties props;

    @PostMapping("/register")
    public ApiResponse<Map<String, Long>> register(@Valid @RequestBody RegisterRequest req) {
        rateLimiter.check("register:" + RequestInfo.ip(), 10);
        Long id = authService.register(req);
        return ApiResponse.ok(Map.of("userId", id));
    }

    @GetMapping("/availability")
    public ApiResponse<Map<String, Boolean>> availability(@RequestParam(required = false) String username,
                                                          @RequestParam(required = false) String email) {
        rateLimiter.check("availability:" + RequestInfo.ip(), 60);
        return ApiResponse.ok(authService.availability(username, email));
    }

    @PostMapping("/login")
    public ApiResponse<LoginResult> login(@Valid @RequestBody LoginRequest req, HttpServletRequest request,
                                          HttpServletResponse response) {
        rateLimiter.check("login-ip:" + RequestInfo.ip(), 30);
        rateLimiter.check("login-account:" + req.account().trim().toLowerCase(), 10);
        boolean mobile = isMobile(request);
        AuthService.TokenPair pair = authService.login(req.account(), req.password(),
                mobile ? AuthService.CLIENT_MOBILE : AuthService.CLIENT_WEB);
        return ApiResponse.ok(respond(pair, mobile, response));
    }

    @PostMapping("/refresh")
    public ApiResponse<LoginResult> refresh(@RequestBody(required = false) RefreshRequest body,
                                            HttpServletRequest request, HttpServletResponse response) {
        boolean mobile = isMobile(request);
        String raw;
        if (mobile) {
            raw = body == null ? null : body.refreshToken();
        } else {
            checkOrigin(request);
            raw = readCookie(request);
        }
        try {
            AuthService.TokenPair pair = authService.refresh(raw,
                    mobile ? AuthService.CLIENT_MOBILE : AuthService.CLIENT_WEB,
                    body == null ? null : body.expectedUserId());
            return ApiResponse.ok(respond(pair, mobile, response));
        } catch (BizException e) {
            // 只在 Cookie 本身失效时清除；属于另一个账号的 Cookie 是别的标签页当前的登录
            if (!mobile && !(e instanceof AuthService.RefreshUserMismatchException)) {
                clearCookie(response);
            }
            throw e;
        }
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(@RequestBody(required = false) RefreshRequest body, HttpServletRequest request,
                                    HttpServletResponse response) {
        if (isMobile(request)) {
            authService.logout(body == null ? null : body.refreshToken());
        } else {
            authService.logout(readCookie(request));
            clearCookie(response);
        }
        return ApiResponse.ok();
    }

    /** SSE 一次性票据（需要登录） */
    @PostMapping("/sse-ticket")
    public ApiResponse<Map<String, Object>> sseTicket(@AuthenticationPrincipal CurrentUser user) {
        return ApiResponse.ok(Map.of("ticket", sseTicketService.issue(user.id()),
                "expiresIn", SseTicketService.TTL_SECONDS));
    }

    private LoginResult respond(AuthService.TokenPair pair, boolean mobile, HttpServletResponse response) {
        if (mobile) {
            return new LoginResult(pair.accessToken(), pair.expiresIn(), pair.refreshToken(), pair.userId());
        }
        if (pair.refreshToken() == null) {
            // 并发刷新的宽限：Cookie 已由先到的请求更新
            return new LoginResult(pair.accessToken(), pair.expiresIn(), null, pair.userId());
        }
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, pair.refreshToken())
                .httpOnly(true)
                .secure(props.getAuth().isCookieSecure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(Duration.ofSeconds(pair.refreshExpiresIn()))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return new LoginResult(pair.accessToken(), pair.expiresIn(), null, pair.userId());
    }

    private void clearCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, "")
                .httpOnly(true).secure(props.getAuth().isCookieSecure()).sameSite("Strict")
                .path(COOKIE_PATH).maxAge(0).build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private static String readCookie(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie c : request.getCookies()) {
            if (REFRESH_COOKIE.equals(c.getName())) {
                return c.getValue();
            }
        }
        return null;
    }

    private static boolean isMobile(HttpServletRequest request) {
        return "mobile".equalsIgnoreCase(request.getHeader("X-Client"));
    }

    /** 用 Cookie 刷新时另外校验 Origin：只接受同源或配置的开发地址 */
    private void checkOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin == null || origin.isBlank()) {
            return;   // 同源 GET/POST 某些浏览器不带 Origin；Cookie 已是 SameSite=Strict
        }
        if (props.getCors().getAllowedOrigins().contains(origin)) {
            return;
        }
        try {
            String originHost = URI.create(origin).getHost();
            String host = request.getHeader("Host");
            String hostOnly = host == null ? null : host.replaceFirst(":\\d+$", "");
            if (originHost != null && originHost.equalsIgnoreCase(hostOnly)) {
                return;
            }
        } catch (IllegalArgumentException ignored) {
            // 非法 Origin 视为跨站
        }
        throw new BizException(ErrorCode.FORBIDDEN, "跨站刷新请求被拒绝");
    }
}

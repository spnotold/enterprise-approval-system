package edu.zju.eas.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * 解析 Authorization: Bearer，校验签名和过期时间，再比对令牌中的 tv 与 sys_user.token_version，并要求用户状态为 ACTIVE。
 * 令牌无效时不直接拒绝（公开接口如 /auth/refresh 仍可访问），只记录原因，由 RestAuthHandlers 决定返回 40101 还是 40102。
 */
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {
    public static final String AUTH_ERROR_ATTR = "eas.authError";

    private final TokenService tokenService;
    private final AuthInfoService authInfoService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                TokenService.AccessClaims claims = tokenService.parseAccess(header.substring(7).trim());
                AuthInfoService.AuthInfo info = authInfoService.get(claims.userId());
                if (info != null && "ACTIVE".equals(info.status()) && info.tokenVersion() == claims.tokenVersion()) {
                    CurrentUser user = info.user();
                    List<SimpleGrantedAuthority> authorities = new ArrayList<>();
                    user.permissions().forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
                    user.roles().forEach(r -> authorities.add(new SimpleGrantedAuthority("ROLE_" + r)));
                    var auth = new UsernamePasswordAuthenticationToken(user, null, authorities);
                    SecurityContextHolder.getContext().setAuthentication(auth);
                } else {
                    request.setAttribute(AUTH_ERROR_ATTR, "INVALID");
                }
            } catch (TokenService.TokenExpiredException e) {
                request.setAttribute(AUTH_ERROR_ATTR, "EXPIRED");
            } catch (TokenService.TokenInvalidException e) {
                request.setAttribute(AUTH_ERROR_ATTR, "INVALID");
            }
        }
        chain.doFilter(request, response);
    }
}

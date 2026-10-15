package edu.zju.eas.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.response.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** 未登录 / 无权限时返回统一 JSON，而不是跳转登录页 */
@Component
@RequiredArgsConstructor
public class RestAuthHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {
    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        ErrorCode ec = "EXPIRED".equals(request.getAttribute(JwtAuthFilter.AUTH_ERROR_ATTR))
                ? ErrorCode.TOKEN_EXPIRED : ErrorCode.UNAUTHORIZED;
        write(response, ec);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        write(response, ErrorCode.FORBIDDEN);
    }

    public void write(HttpServletResponse response, ErrorCode ec) throws IOException {
        response.setStatus(ec.httpStatus());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), ApiResponse.fail(ec));
    }
}

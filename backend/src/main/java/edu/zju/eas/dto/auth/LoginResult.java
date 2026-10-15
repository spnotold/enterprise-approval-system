package edu.zju.eas.dto.auth;

import com.fasterxml.jackson.annotation.JsonInclude;

/** refreshToken 仅移动端返回；userId 供客户端确认刷新结果属于当前会话的用户 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoginResult(String accessToken, int expiresIn, String refreshToken, Long userId) {
}

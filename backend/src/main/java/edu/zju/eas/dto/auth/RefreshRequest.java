package edu.zju.eas.dto.auth;

import jakarta.validation.constraints.Size;

/**
 * 移动端在请求体中传刷新令牌；Web 端从 HttpOnly Cookie 读取。
 * expectedUserId：标签页共享同一个 Cookie，客户端传入当前会话的用户，不一致时拒绝且不轮换。
 */
public record RefreshRequest(@Size(max = 200) String refreshToken, Long expectedUserId) {
}

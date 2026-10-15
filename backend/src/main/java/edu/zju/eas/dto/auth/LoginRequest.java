package edu.zju.eas.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 100) String account,   // 用户名或邮箱
        @NotBlank @Size(max = 64) String password
) {
}

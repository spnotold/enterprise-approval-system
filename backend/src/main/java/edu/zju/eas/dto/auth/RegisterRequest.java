package edu.zju.eas.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 注册请求：只有用户名、姓名、邮箱、密码和申请加入的部门，没有角色字段 */
public record RegisterRequest(
        @NotBlank @Pattern(regexp = "^[a-zA-Z][a-zA-Z0-9_]{3,31}$",
                message = "用户名为 4-32 位字母、数字或下划线，以字母开头")
        String username,

        @NotBlank @Size(max = 50) String realName,

        @NotBlank @Email @Size(max = 100) String email,

        @NotBlank @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).{8,64}$",
                message = "密码 8-64 位，至少包含字母和数字")
        String password,

        @NotNull Long requestedDeptId  // 申请加入的部门，不能选角色
) {
}

package edu.zju.eas.dto.common;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 管理操作必填原因，写入审计日志 */
public record ReasonRequest(@NotBlank(message = "请填写原因") @Size(max = 500) String reason) {
}

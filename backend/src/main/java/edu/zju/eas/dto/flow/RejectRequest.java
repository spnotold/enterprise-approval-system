package edu.zju.eas.dto.flow;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 驳回理由必填，5-500 字 */
public record RejectRequest(@NotNull Integer appVersion,
                            @NotBlank(message = "请填写驳回理由") @Size(min = 5, max = 500, message = "驳回理由 5-500 字")
                            String comment) {
}

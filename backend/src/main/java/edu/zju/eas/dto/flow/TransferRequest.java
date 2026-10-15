package edu.zju.eas.dto.flow;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TransferRequest(@NotNull Long toUserId, @NotBlank(message = "请填写转办原因") @Size(max = 500) String reason) {
}

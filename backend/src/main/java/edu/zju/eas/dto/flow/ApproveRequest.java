package edu.zju.eas.dto.flow;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ApproveRequest(@NotNull Integer appVersion, @Size(max = 500) String comment) {
}

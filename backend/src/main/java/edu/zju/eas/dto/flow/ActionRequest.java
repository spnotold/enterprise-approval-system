package edu.zju.eas.dto.flow;

import jakarta.validation.constraints.NotNull;

/** 提交 / 撤回：带 appVersion，用于条件更新 */
public record ActionRequest(@NotNull Integer appVersion) {
}

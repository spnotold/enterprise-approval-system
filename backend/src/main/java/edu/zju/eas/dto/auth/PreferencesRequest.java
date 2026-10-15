package edu.zju.eas.dto.auth;

import jakarta.validation.constraints.NotNull;

public record PreferencesRequest(@NotNull Boolean emailNotify) {
}

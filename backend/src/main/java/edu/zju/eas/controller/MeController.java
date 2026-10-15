package edu.zju.eas.controller;

import edu.zju.eas.dto.auth.ChangePasswordRequest;
import edu.zju.eas.dto.auth.MeView;
import edu.zju.eas.dto.auth.PreferencesRequest;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.AuthService;
import edu.zju.eas.service.MeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/me")
@RequiredArgsConstructor
public class MeController {
    private final MeService meService;
    private final AuthService authService;

    @GetMapping
    public ApiResponse<MeView> me(@AuthenticationPrincipal CurrentUser user) {
        return ApiResponse.ok(meService.me(user));
    }

    @PutMapping("/password")
    public ApiResponse<Void> changePassword(@AuthenticationPrincipal CurrentUser user,
                                            @Valid @RequestBody ChangePasswordRequest req) {
        authService.changePassword(user.id(), req);
        return ApiResponse.ok();
    }

    @PutMapping("/preferences")
    public ApiResponse<MeView> preferences(@AuthenticationPrincipal CurrentUser user,
                                           @Valid @RequestBody PreferencesRequest req) {
        meService.updatePreferences(user.id(), req.emailNotify());
        return ApiResponse.ok(meService.me(user));
    }
}

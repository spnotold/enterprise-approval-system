package edu.zju.eas.dto.auth;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

public record MeView(
        Long id,
        String username,
        String realName,
        String email,
        Long deptId,
        String deptName,
        List<RoleBrief> roles,
        Set<String> permissions,
        Set<Long> headDeptIds,
        List<GrantBrief> grants,
        boolean emailNotify
) {
    public record RoleBrief(String code, String name, boolean primaryHandler) {
    }

    public record GrantBrief(String permissionCode, String scopeType, Long deptId, String deptName,
                             OffsetDateTime validUntil) {
    }
}

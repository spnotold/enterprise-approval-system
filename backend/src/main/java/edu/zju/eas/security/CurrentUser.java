package edu.zju.eas.security;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/** 当前登录用户，作为 Spring Security 的 principal，通过 @AuthenticationPrincipal 注入 */
public record CurrentUser(
        Long id,
        String username,
        String realName,
        Long deptId,
        Set<String> roles,
        Set<String> permissions,   // 角色权限点并集 + 派生权限点
        Set<Long> headDeptIds,     // 本人负责的部门
        List<GrantScope> grants    // 有效期内或将生效的数据范围授权
) {
    public boolean has(String permission) {
        return permissions.contains(permission);
    }

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isAdmin() {
        return roles.contains(Perms.ROLE_SYS_ADMIN);
    }

    /** 授权是否覆盖某部门（ALL 覆盖全部） */
    public boolean covers(String grantPermission, Long deptId) {
        Instant now = Instant.now();
        return grants.stream().anyMatch(g -> g.covers(grantPermission, deptId, now));
    }

    /** 是否有 ALL 范围的有效授权 */
    public boolean coversAll(String grantPermission) {
        Instant now = Instant.now();
        return grants.stream().anyMatch(g -> g.permissionCode().equals(grantPermission)
                && Perms.SCOPE_ALL.equals(g.scopeType()) && g.activeAt(now));
    }

    public boolean isHeadOf(Long deptId) {
        return deptId != null && headDeptIds.contains(deptId);
    }
}

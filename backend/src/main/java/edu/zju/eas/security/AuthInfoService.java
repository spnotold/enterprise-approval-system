package edu.zju.eas.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.AuthQueryMapper;
import edu.zju.eas.repository.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 用户的角色、权限点、负责部门和有效授权，Caffeine 缓存 30 秒；管理员修改时主动清除。
 */
@Service
@RequiredArgsConstructor
public class AuthInfoService {
    private final SysUserMapper userMapper;
    private final AuthQueryMapper authQueryMapper;

    private final Cache<Long, AuthInfo> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(30))
            .maximumSize(10_000)
            .build();

    /** 用户状态、令牌版本与权限信息；用户不存在时返回 null */
    public record AuthInfo(String status, int tokenVersion, CurrentUser user) {
    }

    public AuthInfo get(Long userId) {
        return cache.get(userId, this::load);
    }

    public void evict(Long userId) {
        cache.invalidate(userId);
    }

    public void evictAll() {
        cache.invalidateAll();
    }

    private AuthInfo load(Long userId) {
        SysUser u = userMapper.selectById(userId);
        if (u == null) {
            return null;
        }
        Set<String> roles = Set.copyOf(authQueryMapper.roleCodes(userId));
        Set<String> perms = new HashSet<>(authQueryMapper.permissionCodes(userId));
        // 系统管理员即使另有业务角色也不能审批（审批权与管理权分离）
        if (roles.contains(Perms.ROLE_SYS_ADMIN)) {
            perms.remove(Perms.TASK_HANDLE);
        }
        Set<Long> heads = Set.copyOf(authQueryMapper.headDeptIds(userId));
        List<GrantScope> grants = authQueryMapper.unrevokedGrants(userId).stream()
                .map(GrantScope::fromEntity)
                .toList();
        // 派生权限点：仅供前端决定菜单是否显示
        Instant now = Instant.now();
        for (GrantScope g : grants) {
            if (!g.activeAt(now)) {
                continue;
            }
            if (Perms.GRANT_FIN_STATS_READ.equals(g.permissionCode())) {
                perms.add(Perms.DERIVED_FIN_STATS);
            }
            if (Perms.GRANT_APP_READ.equals(g.permissionCode()) || Perms.GRANT_BIZ_CONTENT_READ.equals(g.permissionCode())) {
                perms.add(Perms.DERIVED_APP_READ_GRANTED);
            }
            if (Perms.GRANT_APP_READ.equals(g.permissionCode()) && Perms.SCOPE_ALL.equals(g.scopeType())) {
                perms.add(Perms.DERIVED_ENTERPRISE_STATS);
            }
        }
        CurrentUser cu = new CurrentUser(u.getId(), u.getUsername(), u.getRealName(), u.getDeptId(),
                roles, Set.copyOf(perms), heads, grants);
        return new AuthInfo(u.getStatus(), u.getTokenVersion(), cu);
    }
}

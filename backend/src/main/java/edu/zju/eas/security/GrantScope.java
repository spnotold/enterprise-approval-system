package edu.zju.eas.security;

import edu.zju.eas.model.org.DataScopeGrant;

import java.time.Instant;
import java.time.OffsetDateTime;

/** 一条数据范围授权（缓存在 CurrentUser 中，使用时再按当前时间判断是否生效） */
public record GrantScope(String permissionCode, String scopeType, Long deptId,
                         OffsetDateTime validFrom, OffsetDateTime validUntil) {

    public static GrantScope fromEntity(DataScopeGrant g) {
        return new GrantScope(g.getPermissionCode(), g.getScopeType(), g.getDeptId(), g.getValidFrom(), g.getValidUntil());
    }

    public boolean activeAt(Instant now) {
        return !validFrom.toInstant().isAfter(now) && (validUntil == null || validUntil.toInstant().isAfter(now));
    }

    public boolean covers(String permission, Long dept, Instant now) {
        if (!permissionCode.equals(permission) || !activeAt(now)) {
            return false;
        }
        return Perms.SCOPE_ALL.equals(scopeType) || (dept != null && dept.equals(deptId));
    }
}

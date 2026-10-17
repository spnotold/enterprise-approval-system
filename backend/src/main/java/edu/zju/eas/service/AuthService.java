package edu.zju.eas.service;

import edu.zju.eas.common.Hashes;
import edu.zju.eas.common.RequestInfo;
import edu.zju.eas.dto.auth.ChangePasswordRequest;
import edu.zju.eas.dto.auth.RegisterRequest;
import edu.zju.eas.model.org.RefreshToken;
import edu.zju.eas.model.org.SysUser;
import edu.zju.eas.repository.RefreshTokenMapper;
import edu.zju.eas.repository.SysUserMapper;
import edu.zju.eas.response.BizException;
import edu.zju.eas.response.ErrorCode;
import edu.zju.eas.response.FieldErrors;
import edu.zju.eas.security.AuthInfoService;
import edu.zju.eas.security.TokenService;
import edu.zju.eas.service.notify.SseHub;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {
    public static final String CLIENT_WEB = "WEB";
    public static final String CLIENT_MOBILE = "MOBILE";
    /** 两个标签页同时用同一刷新令牌刷新时，后到的不按“泄露”处理 */
    private static final Duration ROTATION_GRACE = Duration.ofSeconds(10);

    private final SysUserMapper userMapper;
    private final RefreshTokenMapper refreshTokenMapper;
    private final DepartmentService deptService;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final AuthInfoService authInfoService;
    private final AuditService auditService;
    private final SseHub sseHub;
    private final Clock clock;

    /** 访问令牌 + 刷新令牌原文；refreshToken 为 null 表示沿用客户端现有的刷新令牌 */
    public record TokenPair(Long userId, String accessToken, int expiresIn, String refreshToken, int refreshExpiresIn) {
    }

    /** 刷新令牌本身有效，但属于另一个账号（别的标签页已换账号登录）：拒绝，Cookie 是那个标签页的登录，不能清除 */
    public static final class RefreshUserMismatchException extends BizException {
        RefreshUserMismatchException() {
            super(ErrorCode.UNAUTHORIZED);
        }
    }

    @Transactional
    public Long register(RegisterRequest req) {
        // 唯一性检查；数据库 lower(username)、lower(email) 唯一索引兜底并发注册
        FieldErrors errors = new FieldErrors();
        if (userMapper.existsUsername(req.username())) {
            errors.add("username", "USERNAME_TAKEN", "用户名已被占用");
        }
        if (userMapper.existsEmail(req.email())) {
            errors.add("email", "EMAIL_TAKEN", "邮箱已被占用");
        }
        errors.throwIfAny();
        deptService.requireEnabled(req.requestedDeptId());

        SysUser u = new SysUser();
        u.setUsername(req.username());
        u.setRealName(req.realName().trim());
        u.setEmail(req.email().trim().toLowerCase());
        u.setPasswordHash(passwordEncoder.encode(req.password()));
        u.setRequestedDeptId(req.requestedDeptId());
        u.setStatus(SysUser.PENDING);   // 待管理员审核，不授予任何角色
        userMapper.insert(u);
        return u.getId();
    }

    public Map<String, Boolean> availability(String username, String email) {
        var result = new java.util.LinkedHashMap<String, Boolean>();
        if (username != null && !username.isBlank()) {
            result.put("usernameAvailable", !userMapper.existsUsername(username.trim()));
        }
        if (email != null && !email.isBlank()) {
            result.put("emailAvailable", !userMapper.existsEmail(email.trim()));
        }
        return result;
    }

    @Transactional(noRollbackFor = BizException.class)
    public TokenPair login(String account, String password, String client) {
        SysUser u = userMapper.findByAccount(account.trim());
        if (u != null && u.isLocked(clock)) {
            throw new BizException(ErrorCode.ACCOUNT_DISABLED_OR_LOCKED, "账号已锁定，请 15 分钟后再试");
        }
        if (u == null || !passwordEncoder.matches(password, u.getPasswordHash())) {
            if (u != null) {
                // 15 分钟内连续失败 5 次，锁定 15 分钟
                OffsetDateTime lockedUntil = userMapper.recordFailure(u.getId());
                if (lockedUntil != null) {
                    auditService.write(null, null, "ACCOUNT_LOCKED", "USER", String.valueOf(u.getId()), null,
                            Map.of("username", u.getUsername(), "lockedUntil", lockedUntil.toString()),
                            "15 分钟内连续 5 次密码错误");
                }
            }
            // 不区分账号不存在与密码错误
            throw new BizException(ErrorCode.BAD_CREDENTIALS);
        }
        if (!SysUser.ACTIVE.equals(u.getStatus())) {
            throw new BizException(SysUser.PENDING.equals(u.getStatus())
                    ? ErrorCode.ACCOUNT_PENDING
                    : ErrorCode.ACCOUNT_DISABLED_OR_LOCKED);
        }
        userMapper.recordSuccess(u.getId());
        return issuePair(u, client, UUID.randomUUID());
    }

    /**
     * 刷新令牌每次使用后轮换；已经轮换掉的旧令牌再次出现时判定为泄露，整族令牌全部撤销。
     */
    @Transactional(noRollbackFor = BizException.class)
    public TokenPair refresh(String rawToken, String client, Long expectedUserId) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        RefreshToken t = refreshTokenMapper.findByHash(Hashes.sha256Hex(rawToken));
        if (t == null || t.getRevokedAt() != null || !t.getClient().equals(client)) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        // 另一个标签页已用这个 Cookie 登录了别的账号：拒绝且不轮换，避免以他人身份重放请求
        if (expectedUserId != null && !expectedUserId.equals(t.getUserId())) {
            throw new RefreshUserMismatchException();
        }
        if (t.getRotatedAt() != null) {
            return refreshRotated(t, client);
        }
        if (!t.getExpiresAt().toInstant().isAfter(clock.instant())) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        if (refreshTokenMapper.markRotated(t.getId()) == 0) {
            // 读到未轮换之后被并发的刷新抢先轮换（或撤销）：按提交后的状态重新判断，刚轮换的同样走宽限
            RefreshToken latest = refreshTokenMapper.selectById(t.getId());
            if (latest == null || latest.getRevokedAt() != null || latest.getRotatedAt() == null) {
                throw new BizException(ErrorCode.UNAUTHORIZED);
            }
            return refreshRotated(latest, client);
        }
        SysUser u = userMapper.selectById(t.getUserId());
        if (u == null || !SysUser.ACTIVE.equals(u.getStatus())) {
            refreshTokenMapper.revokeFamily(t.getFamilyId());
            throw new BizException(ErrorCode.ACCOUNT_DISABLED_OR_LOCKED);
        }
        return issuePair(u, client, t.getFamilyId());
    }

    /** 已轮换的令牌再次出现：未过期且在宽限期内按并发刷新处理，超出宽限判定为泄露 */
    private TokenPair refreshRotated(RefreshToken t, String client) {
        boolean withinGrace = !t.getRotatedAt().toInstant().isBefore(clock.instant().minus(ROTATION_GRACE));
        // 宽限补发只限未过期的令牌；已过期按无效令牌拒绝，且不按泄露撤销整族
        if (withinGrace && t.getExpiresAt().toInstant().isAfter(clock.instant()) && CLIENT_WEB.equals(client)) {
            // 多个标签页几乎同时刷新：先到的已经轮换并写回 Cookie，后到的只补发访问令牌，不再轮换
            SysUser u = userMapper.selectById(t.getUserId());
            if (u != null && SysUser.ACTIVE.equals(u.getStatus())) {
                return new TokenPair(u.getId(), tokenService.issueAccess(u.getId(), u.getTokenVersion()),
                        tokenService.accessTtlSeconds(), null, 0);
            }
        }
        if (!withinGrace) {
            refreshTokenMapper.revokeFamily(t.getFamilyId());
            auditService.write(null, null, "REFRESH_TOKEN_REUSE", "USER", String.valueOf(t.getUserId()),
                    null, Map.of("familyId", t.getFamilyId().toString()), "已轮换的刷新令牌被再次使用，撤销整族令牌");
        }
        throw new BizException(ErrorCode.UNAUTHORIZED);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        RefreshToken t = refreshTokenMapper.findByHash(Hashes.sha256Hex(rawToken));
        if (t != null) {
            refreshTokenMapper.revokeFamily(t.getFamilyId());
        }
    }

    /** 修改密码需要校验旧密码，成功后 token_version + 1 并撤销该用户所有刷新令牌，其他设备上的登录随之失效 */
    @Transactional
    public void changePassword(Long userId, ChangePasswordRequest req) {
        SysUser u = userMapper.selectById(userId);
        if (u == null || !passwordEncoder.matches(req.oldPassword(), u.getPasswordHash())) {
            throw BizException.rule("oldPassword", "OLD_PASSWORD_WRONG", "原密码不正确");
        }
        if (req.oldPassword().equals(req.newPassword())) {
            throw BizException.rule("newPassword", "PASSWORD_UNCHANGED", "新密码不能与原密码相同");
        }
        SysUser upd = new SysUser();
        upd.setId(userId);
        upd.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        userMapper.updateById(upd);
        invalidateSessions(userId);
    }

    /** 令牌版本 + 1、撤销刷新令牌、清权限缓存，并关闭该用户已打开的 SSE 连接 */
    @Transactional
    public void invalidateSessions(Long userId) {
        userMapper.bumpTokenVersion(userId);
        refreshTokenMapper.revokeAllOfUser(userId);
        authInfoService.evict(userId);
        sseHub.closeAfterCommit(userId);
    }

    private TokenPair issuePair(SysUser u, String client, UUID familyId) {
        String access = tokenService.issueAccess(u.getId(), u.getTokenVersion());
        String raw = tokenService.newOpaqueToken();
        RefreshToken rt = new RefreshToken();
        rt.setUserId(u.getId());
        rt.setTokenHash(Hashes.sha256Hex(raw));   // 只存 SHA-256
        rt.setFamilyId(familyId);
        rt.setClient(client);
        rt.setExpiresAt(OffsetDateTime.now(clock).plusSeconds(tokenService.refreshTtlSeconds()));
        rt.setUserAgent(RequestInfo.userAgent());
        rt.setIp(RequestInfo.ip());
        refreshTokenMapper.insert(rt);
        return new TokenPair(u.getId(), access, tokenService.accessTtlSeconds(), raw, tokenService.refreshTtlSeconds());
    }
}

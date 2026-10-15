package edu.zju.eas.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import edu.zju.eas.config.EasProperties;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

/** 访问令牌：HS256 JWT，30 分钟；刷新令牌：32 字节随机串，数据库只存 SHA-256 */
@Service
public class TokenService {
    private final byte[] secret;
    private final Clock clock;
    private final int accessMinutes;
    private final int refreshDays;
    private final SecureRandom random = new SecureRandom();

    public TokenService(EasProperties props, Clock clock) {
        String s = props.getJwt().getSecret();
        if (s == null || s.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET 未设置或不足 32 字节");
        }
        this.secret = s.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
        this.accessMinutes = props.getJwt().getAccessMinutes();
        this.refreshDays = props.getJwt().getRefreshDays();
    }

    public record AccessClaims(Long userId, int tokenVersion) {
    }

    public static class TokenExpiredException extends Exception {
    }

    public static class TokenInvalidException extends Exception {
    }

    public String issueAccess(Long userId, int tokenVersion) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .claim("tv", tokenVersion)   // 与 sys_user.token_version 比对，用于令牌失效
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(accessMinutes * 60L)))
                .jwtID(UUID.randomUUID().toString())
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            jwt.sign(new MACSigner(secret));
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
        return jwt.serialize();
    }

    public AccessClaims parseAccess(String token) throws TokenExpiredException, TokenInvalidException {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(secret))) {
                throw new TokenInvalidException();
            }
            JWTClaimsSet c = jwt.getJWTClaimsSet();
            Date exp = c.getExpirationTime();
            if (exp == null || c.getSubject() == null || c.getClaim("tv") == null) {
                throw new TokenInvalidException();
            }
            if (!exp.toInstant().isAfter(clock.instant())) {
                throw new TokenExpiredException();
            }
            return new AccessClaims(Long.valueOf(c.getSubject()), ((Number) c.getClaim("tv")).intValue());
        } catch (ParseException | JOSEException | NumberFormatException | ClassCastException e) {
            throw new TokenInvalidException();
        }
    }

    public int accessTtlSeconds() {
        return accessMinutes * 60;
    }

    public int refreshTtlSeconds() {
        return refreshDays * 24 * 3600;
    }

    /** 刷新令牌原文，只交给客户端一次 */
    public String newOpaqueToken() {
        byte[] b = new byte[32];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}

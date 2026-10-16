package edu.zju.eas.security;

import edu.zju.eas.config.EasProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** TokenService 启动校验：拒绝 template.env 中的占位值，接收真正的随机密钥。 */
class TokenServicePlaceholderSecretTest {

    private static TokenService build(String secret) {
        EasProperties props = new EasProperties();
        props.getJwt().setSecret(secret);
        return new TokenService(props, Clock.systemUTC());
    }

    @Test
    void rejectsTemplatePlaceholderValue() {
        String placeholder = "change_me_to_a_random_string_at_least_32_bytes";
        assertThat(TokenService.isPlaceholderSecret(placeholder)).isTrue();
        assertThatThrownBy(() -> build(placeholder))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("占位")
                .hasMessageContaining("openssl rand -base64 48");
    }

    @Test
    void rejectsAnyValueContainingChangeMe() {
        String custom = "CHANGE_ME_pls_use_openssl_rand_bbbbbbbbbbbbbbbbbbbbbb";
        assertThat(TokenService.isPlaceholderSecret(custom)).isTrue();
        assertThatThrownBy(() -> build(custom))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("占位");
    }

    @Test
    void rejectsTooShortRandomValue() {
        assertThatThrownBy(() -> build("too-short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("不足 32 字节")
                .hasMessageContaining("openssl rand -base64 48");
    }

    @Test
    void acceptsGenuinelyRandomSecret() throws Exception {
        String random = "Y3VycmVudGx5LXJlcGxhY2luZy10aGlzLXdpdGgtcmFuZG9tLW9jdGV0cw=="; // 48B base64
        assertThat(TokenService.isPlaceholderSecret(random)).isFalse();
        TokenService svc = build(random);
        // 构造成功即可；再加一个 issue/parse 烟雾测试
        String issued = svc.issueAccess(42L, 1);
        assertThat(issued).isNotBlank().contains(".");
        TokenService.AccessClaims claims = svc.parseAccess(issued);
        assertThat(claims.userId()).isEqualTo(42L);
        assertThat(claims.tokenVersion()).isEqualTo(1);
    }
}
package edu.zju.eas.notify;

import edu.zju.eas.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 application.yml 中 SMTP 认证 / 加密开关正确绑定到 JavaMailSenderImpl.javaMailProperties。
 * application.yml 中 SMTP_AUTH / SMTP_STARTTLS / SMTP_SSL 默认 false（Mailpit 演示场景），
 * 但属性必须存在并被 Spring 转发到 mail.smtp.* 上，真实 SMTP 切换开关时才能即时生效。
 */
class SmtpConfigTest extends IntegrationTestBase {

    @Autowired
    JavaMailSenderImpl mailSender;

    @Test
    void smtpAuthFlagIsPropagatedToJavaMailProperties() {
        Properties props = mailSender.getJavaMailProperties();
        assertThat(props).containsKey("mail.smtp.auth");
        assertThat(props.getProperty("mail.smtp.auth")).isEqualTo("false");
    }

    @Test
    void startTlsFlagIsPropagatedToJavaMailProperties() {
        Properties props = mailSender.getJavaMailProperties();
        assertThat(props).containsKey("mail.smtp.starttls.enable");
        assertThat(props.getProperty("mail.smtp.starttls.enable")).isEqualTo("false");
    }

    @Test
    void sslFlagIsPropagatedToJavaMailProperties() {
        Properties props = mailSender.getJavaMailProperties();
        assertThat(props).containsKey("mail.smtp.ssl.enable");
        assertThat(props.getProperty("mail.smtp.ssl.enable")).isEqualTo("false");
    }

    @Test
    void hostPortBindFromProperties() {
        // application-test.yml 没有覆盖 SMTP_HOST/PORT，沿用 application.yml 默认 localhost:1025
        assertThat(mailSender.getHost()).isEqualTo("localhost");
        assertThat(mailSender.getPort()).isEqualTo(1025);
    }

    @Test
    void timeoutPropertiesArePresent() {
        Properties props = mailSender.getJavaMailProperties();
        assertThat(props.getProperty("mail.smtp.connectiontimeout")).isEqualTo("10000");
        assertThat(props.getProperty("mail.smtp.timeout")).isEqualTo("10000");
        assertThat(props.getProperty("mail.smtp.writetimeout")).isEqualTo("10000");
    }
}
package edu.zju.eas.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "eas")
public class EasProperties {
    private Jwt jwt = new Jwt();
    private Minio minio = new Minio();
    private Auth auth = new Auth();
    private Cors cors = new Cors();
    private App app = new App();

    @Data
    public static class Jwt {
        /** HS256 密钥，来自环境变量 JWT_SECRET，至少 32 字节 */
        private String secret;
        private int accessMinutes = 30;
        private int refreshDays = 7;
    }

    @Data
    public static class Minio {
        private String endpoint;
        private String accessKey;
        private String secretKey;
        private String bucket = "eas-files";
    }

    @Data
    public static class Auth {
        /** 刷新令牌 Cookie 是否带 Secure；通过局域网 IP 以 http 演示时需设为 false */
        private boolean cookieSecure = true;
    }

    @Data
    public static class Cors {
        /** 开发时允许的前端地址；部署后前后端经 Nginx 同源，不需要跨域 */
        private List<String> allowedOrigins = new ArrayList<>(List.of("http://localhost:5173", "http://localhost:5174"));
    }

    @Data
    public static class App {
        /** 邮件中“在系统中查看”链接的前缀 */
        private String baseUrl = "http://localhost";
        /** 发件人地址 */
        private String mailFrom = "noreply@eas.local";
    }
}

package edu.zju.eas.config;

import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    /** 后端使用只能读写 eas-files 桶的专用 key，不使用 root 账号 */
    @Bean
    public MinioClient minioClient(EasProperties props) {
        EasProperties.Minio m = props.getMinio();
        return MinioClient.builder()
                .endpoint(m.getEndpoint())
                .credentials(m.getAccessKey(), m.getSecretKey())
                .build();
    }
}

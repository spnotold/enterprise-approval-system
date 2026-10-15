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
                // 指定区域，避免客户端先发 GetBucketLocation：专用 key 的策略只允许读写对象和列桶，没有该权限会 Access Denied
                .region(m.getRegion())
                .build();
    }
}

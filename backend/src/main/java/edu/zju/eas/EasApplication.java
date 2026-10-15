package edu.zju.eas;

import edu.zju.eas.config.EasProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

import java.time.Clock;
import java.time.ZoneId;
import java.util.TimeZone;

@SpringBootApplication
@MapperScan("edu.zju.eas.repository")
@EnableConfigurationProperties(EasProperties.class)
public class EasApplication {

    public static void main(String[] args) {
        // 统一使用上海时区计算自然日与统计日期
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        SpringApplication.run(EasApplication.class, args);
    }

    @Bean
    Clock clock() {  // 注入 Clock，测试时可替换为固定时间
        return Clock.system(ZoneId.of("Asia/Shanghai"));
    }
}

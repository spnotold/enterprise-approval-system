package edu.zju.eas.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.deser.DeserializationProblemHandler;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.util.TimeZone;

/**
 * 时间按 ISO 8601 带偏移输出（上海时区）；请求中出现 DTO 未定义的字段时丢弃并记录 WARN。
 * 申请人、部门、金额、状态等字段不在 DTO 中，客户端即使带上也会在这里被丢弃。
 */
@Slf4j
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer easJacksonCustomizer() {
        return builder -> builder
                .timeZone(TimeZone.getTimeZone("Asia/Shanghai"))
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .featuresToEnable(SerializationFeature.WRITE_DATES_WITH_CONTEXT_TIME_ZONE)
                .featuresToDisable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .postConfigurer(mapper -> mapper.addHandler(new DeserializationProblemHandler() {
                    @Override
                    public boolean handleUnknownProperty(DeserializationContext ctxt, JsonParser p,
                                                         JsonDeserializer<?> deserializer, Object beanOrClass,
                                                         String propertyName) throws IOException {
                        Class<?> type = beanOrClass instanceof Class<?> c ? c : beanOrClass.getClass();
                        log.warn("丢弃请求中未定义的字段 {}.{}", type.getSimpleName(), propertyName);
                        p.skipChildren();
                        return true;
                    }
                }));
    }
}

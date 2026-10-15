package edu.zju.eas.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import edu.zju.eas.common.mybatis.UuidTypeHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisPlusConfig {

    /** 分页插件与乐观锁插件 */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        PaginationInnerInterceptor pagination = new PaginationInnerInterceptor(DbType.POSTGRE_SQL);
        pagination.setMaxLimit(100L);
        interceptor.addInnerInterceptor(pagination);
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }

    /** UUID 列（如 refresh_token.family_id）全局使用 UuidTypeHandler；JSONB 处理器按字段单独声明 */
    @Bean
    public ConfigurationCustomizer typeHandlers() {
        return configuration -> configuration.getTypeHandlerRegistry().register(java.util.UUID.class, new UuidTypeHandler());
    }
}

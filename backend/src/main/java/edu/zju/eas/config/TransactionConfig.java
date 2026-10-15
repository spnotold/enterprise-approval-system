package edu.zju.eas.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** 事务拦截器排在最外层，审计等切面在事务之内执行 */
@Configuration
@EnableTransactionManagement(order = Ordered.HIGHEST_PRECEDENCE + 100, proxyTargetClass = true)
public class TransactionConfig {
}

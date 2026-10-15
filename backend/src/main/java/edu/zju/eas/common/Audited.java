package edu.zju.eas.common;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 管理端写操作的审计：方法体内用 AuditTrail.record(...) 提供目标与前后值，
 * 由 AuditAspect 在同一事务里写入 audit_log（事务回滚则审计记录一起回滚）。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited {
    /** 动作，如 USER_DISABLE、TEMPLATE_PUBLISH */
    String action();

    /** 目标类型，如 USER、DEPARTMENT、TEMPLATE */
    String targetType();
}

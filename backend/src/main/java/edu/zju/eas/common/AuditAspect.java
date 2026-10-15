package edu.zju.eas.common;

import edu.zju.eas.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/** 排在事务拦截器之内执行（见 TransactionConfig），审计记录与业务修改同一事务提交 */
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class AuditAspect {
    private final AuditService auditService;

    @Around("@annotation(audited)")
    public Object around(ProceedingJoinPoint pjp, Audited audited) throws Throwable {
        AuditTrail.begin();
        Object result;
        List<AuditTrail.Entry> entries;
        try {
            result = pjp.proceed();
        } finally {
            entries = AuditTrail.end();
        }
        if (entries.isEmpty()) {
            auditService.write(audited.action(), audited.targetType(), null, null, null, null);
        }
        for (AuditTrail.Entry e : entries) {
            auditService.write(audited.action(), audited.targetType(), e.targetId(), e.before(), e.after(), e.reason());
        }
        return result;
    }
}

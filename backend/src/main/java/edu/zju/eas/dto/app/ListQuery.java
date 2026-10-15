package edu.zju.eas.dto.app;

import java.time.LocalDate;
import java.util.Set;

/** 仅由服务端构造；uid、范围集合不得从请求参数绑定。 */
public record ListQuery(String scope, Long userId, Set<Long> deptIds, boolean allDepartments,
        String type, String status, LocalDate from, LocalDate to, String keyword) {}

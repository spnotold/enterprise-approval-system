package edu.zju.eas.security;

/** 角色、功能权限点与授权权限点常量 */
public final class Perms {
    private Perms() {
    }

    // 内置角色
    public static final String ROLE_EMPLOYEE = "EMPLOYEE";
    public static final String ROLE_DEPT_HEAD = "DEPT_HEAD";
    public static final String ROLE_FINANCE_APPROVER = "FINANCE_APPROVER";
    public static final String ROLE_ENTERPRISE_HEAD = "ENTERPRISE_HEAD";
    public static final String ROLE_SYS_ADMIN = "SYS_ADMIN";

    // 业务功能权限点
    public static final String APP_CREATE = "APP_CREATE";
    public static final String TASK_HANDLE = "TASK_HANDLE";
    public static final String APP_READ_DEPT = "APP_READ_DEPT";
    public static final String STATS_DEPT = "STATS_DEPT";

    // 管理功能权限点
    public static final String ADMIN_USER = "ADMIN_USER";
    public static final String ADMIN_DEPT = "ADMIN_DEPT";
    public static final String ADMIN_GRANT = "ADMIN_GRANT";
    public static final String ADMIN_TEMPLATE = "ADMIN_TEMPLATE";
    public static final String ADMIN_CONFIG = "ADMIN_CONFIG";
    public static final String ADMIN_AUDIT = "ADMIN_AUDIT";
    public static final String ADMIN_TRANSFER = "ADMIN_TRANSFER";

    // 数据范围授权的权限点（data_scope_grant.permission_code）
    public static final String GRANT_APP_READ = "APP_READ";
    public static final String GRANT_FIN_STATS_READ = "FIN_STATS_READ";
    public static final String GRANT_BIZ_CONTENT_READ = "BIZ_CONTENT_READ";

    // 由有效授权派生、仅用于前端显示菜单的权限点
    public static final String DERIVED_FIN_STATS = "FIN_STATS";
    public static final String DERIVED_ENTERPRISE_STATS = "ENTERPRISE_STATS";
    public static final String DERIVED_APP_READ_GRANTED = "APP_READ_GRANTED";

    public static final String SCOPE_DEPT = "DEPT";
    public static final String SCOPE_ALL = "ALL";
}

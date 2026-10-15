package edu.zju.eas.response;

/** 错误码：码值前三位与 HTTP 状态一致 */
public enum ErrorCode {
    OK(0, 200, "OK"),
    BAD_REQUEST(40000, 400, "参数格式错误"),
    MISSING_HEADER(40001, 400, "缺少必要的请求头"),
    UNAUTHORIZED(40101, 401, "未登录或登录已失效"),
    TOKEN_EXPIRED(40102, 401, "访问令牌已过期"),
    BAD_CREDENTIALS(40103, 401, "用户名或密码错误"),
    ACCOUNT_PENDING(40104, 403, "账号待管理员审核"),
    ACCOUNT_DISABLED_OR_LOCKED(40105, 403, "账号已停用或已锁定"),
    FORBIDDEN(40301, 403, "无操作权限"),
    NOT_CURRENT_APPROVER(40302, 403, "您不是当前审批人"),
    SELF_APPROVAL_FORBIDDEN(40303, 403, "不能审批自己的申请"),
    NOT_FOUND(40401, 404, "资源不存在或无权查看"),
    STATE_CHANGED(40901, 409, "申请状态已变化，请刷新后重试"),
    TASK_ALREADY_PROCESSED(40902, 409, "待办已被处理"),
    REQUEST_IN_PROGRESS(40903, 409, "相同请求正在处理中，请稍候"),
    IDEMPOTENCY_KEY_REUSED(40904, 409, "幂等键已被用于不同的请求"),
    DRAFT_MODIFIED(40905, 409, "草稿已在别处修改，请刷新后重试"),
    TEMPLATE_UPDATED(40906, 409, "模板已更新，请按新版本确认后重新提交"),
    FILE_TOO_LARGE(41301, 413, "文件过大"),
    FILE_TYPE_NOT_ALLOWED(41501, 415, "文件类型不允许"),
    BIZ_RULE(42201, 422, "业务规则校验失败"),
    RATE_LIMITED(42901, 429, "请求过于频繁，请稍后再试"),
    SERVER_ERROR(50000, 500, "服务器错误");

    private final int code;
    private final int httpStatus;
    private final String message;

    ErrorCode(int code, int httpStatus, String message) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.message = message;
    }

    public int code() {
        return code;
    }

    public int httpStatus() {
        return httpStatus;
    }

    public String message() {
        return message;
    }
}

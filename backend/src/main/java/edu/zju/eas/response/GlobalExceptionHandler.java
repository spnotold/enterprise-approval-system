package edu.zju.eas.response;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;
import java.util.Map;

/** 把异常转换成 ApiResponse，不向前端返回堆栈 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 唯一约束名 → 对外的错误；数据库约束是并发场景下的最后一道防线 */
    private static final Map<String, FieldError> CONSTRAINTS = Map.ofEntries(
            Map.entry("uk_invoice_app_sha", new FieldError("items", "EXP_DUP_INVOICE_IN_APP", "同一报销单内不能重复使用同一票据文件")),
            Map.entry("uk_invoice_app_no", new FieldError("items", "EXP_DUP_INVOICE_IN_APP", "同一报销单内不能重复使用同一票据号")),
            Map.entry("uk_purchase_quote_supplier", new FieldError("quotes", "PUR_SUPPLIER_DUP", "报价供应商重复")),
            Map.entry("uk_user_username", new FieldError("username", "USERNAME_TAKEN", "用户名已被占用")),
            Map.entry("uk_user_email", new FieldError("email", "EMAIL_TAKEN", "邮箱已被占用")),
            Map.entry("uk_department_code", new FieldError("code", "DEPT_CODE_DUP", "部门编码已存在")),
            Map.entry("uk_department_name", new FieldError("name", "DEPT_NAME_DUP", "部门名称已存在")),
            Map.entry("uk_template_code", new FieldError("code", "TPL_BASIC", "模板编码已存在")),
            Map.entry("uk_expense_type_code", new FieldError("code", "EXPENSE_TYPE_DUP", "费用类型编码已存在")));

    /** 这些约束冲突说明并发操作抢先改变了状态 */
    private static final List<String> STATE_CONSTRAINTS = List.of(
            "uk_task_pending", "uk_flow_node_active", "uk_approval_log_task_action", "uk_flow_instance_app",
            "uk_template_version_draft", "uk_template_version_published", "uk_urge_bucket", "uk_user_role_primary");

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> biz(BizException e) {
        return respond(e.errorCode(), e.getMessage(), e.errors());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(MethodArgumentNotValidException e) {
        List<FieldError> errors = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new FieldError(f.getField(), "FORMAT_" + upper(f.getCode()), f.getDefaultMessage()))
                .toList();
        List<FieldError> global = e.getBindingResult().getGlobalErrors().stream()
                .map(g -> new FieldError(null, "FORMAT_" + upper(g.getCode()), g.getDefaultMessage()))
                .toList();
        var all = new java.util.ArrayList<>(errors);
        all.addAll(global);
        String msg = all.size() == 1 ? all.get(0).message() : ErrorCode.BAD_REQUEST.message();
        return respond(ErrorCode.BAD_REQUEST, msg, all);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Void>> invalidParams(HandlerMethodValidationException e) {
        List<FieldError> errors = e.getAllValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream().map(err -> new FieldError(
                        r.getMethodParameter().getParameterName(), "FORMAT", err.getDefaultMessage())))
                .toList();
        return respond(ErrorCode.BAD_REQUEST, null, errors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> violation(ConstraintViolationException e) {
        List<FieldError> errors = e.getConstraintViolations().stream()
                .map(v -> new FieldError(String.valueOf(v.getPropertyPath()), "FORMAT", v.getMessage()))
                .toList();
        return respond(ErrorCode.BAD_REQUEST, null, errors);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<ApiResponse<Void>> unreadable(Exception e) {
        log.debug("请求格式错误: {}", e.getMessage());
        return respond(ErrorCode.BAD_REQUEST, "请求格式错误", null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> method(HttpRequestMethodNotSupportedException e) {
        return respond(ErrorCode.BAD_REQUEST, "不支持的请求方法", null);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> missingHeader(MissingRequestHeaderException e) {
        return respond(ErrorCode.MISSING_HEADER, "缺少请求头 " + e.getHeaderName(), null);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> tooLarge(MaxUploadSizeExceededException e) {
        return respond(ErrorCode.FILE_TOO_LARGE, "文件超过 10 MB", null);
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> multipart(MultipartException e) {
        return respond(ErrorCode.BAD_REQUEST, "上传请求格式错误", null);
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    public ResponseEntity<ApiResponse<Void>> denied(Exception e) {
        return respond(ErrorCode.FORBIDDEN, null, null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> noResource(NoResourceFoundException e) {
        return respond(ErrorCode.NOT_FOUND, null, null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> integrity(DataIntegrityViolationException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        for (var entry : CONSTRAINTS.entrySet()) {
            if (msg.contains("\"" + entry.getKey() + "\"")) {
                FieldError fe = entry.getValue();
                return respond(ErrorCode.BIZ_RULE, fe.message(), List.of(fe));
            }
        }
        for (String c : STATE_CONSTRAINTS) {
            if (msg.contains("\"" + c + "\"")) {
                return respond(ErrorCode.STATE_CHANGED, null, null);
            }
        }
        if (msg.contains("violates foreign key constraint")) {
            log.warn("外键约束冲突: {}", msg);
            return respond(ErrorCode.BIZ_RULE, "数据仍被引用或引用的数据不存在", null);
        }
        if (msg.contains("violates check constraint")) {
            log.warn("CHECK 约束冲突: {}", msg);
            return respond(ErrorCode.BAD_REQUEST, "数据不满足约束条件", null);
        }
        log.error("数据完整性错误", e);
        return respond(ErrorCode.SERVER_ERROR, null, null);
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> lock(PessimisticLockingFailureException e) {
        return respond(ErrorCode.REQUEST_IN_PROGRESS, null, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> other(Exception e) {
        log.error("未处理的异常", e);
        return respond(ErrorCode.SERVER_ERROR, null, null);
    }

    private static ResponseEntity<ApiResponse<Void>> respond(ErrorCode ec, String message, List<FieldError> errors) {
        return ResponseEntity.status(ec.httpStatus()).body(ApiResponse.fail(ec, message, errors));
    }

    private static String upper(String s) {
        return s == null ? "INVALID" : s.toUpperCase();
    }
}

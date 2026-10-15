package edu.zju.eas.dto.admin;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;

/** 管理 API 的输入及只读投影；不会序列化用户密码或令牌。 */
public final class AdminDtos {
    private AdminDtos() {}
    public record Reason(@NotBlank @Size(max=500) String reason) {}
    public record Approve(@NotNull Long deptId, @Size(max=500) String reason) {}
    public record ChangeDept(@NotNull Long deptId, @NotBlank @Size(max=500) String reason) {}
    public record GrantRole(@NotBlank String roleCode, @NotBlank @Size(max=500) String reason) {}
    public record DepartmentSave(@Pattern(regexp="[A-Za-z][A-Za-z0-9_]{0,31}") String code,
                                 @NotBlank @Size(max=50) String name, Integer sortOrder,
                                 @Size(max=500) String reason) {}
    public record SetHead(Long userId, @NotBlank @Size(max=500) String reason) {}
    public record GrantCreate(@NotNull Long userId, @NotBlank String permissionCode, @NotBlank String scopeType,
                              Long deptId, OffsetDateTime validFrom, OffsetDateTime validUntil,
                              @NotBlank @Size(max=500) String reason) {}
    public record ExpenseTypeSave(@Pattern(regexp="[A-Za-z][A-Za-z0-9_]{0,31}") String code,
                                  @NotBlank @Size(max=50) String name, Boolean enabled, Integer sortOrder) {}
    public record ConfigSave(@NotNull @Size(max=1000) String value, @NotBlank @Size(max=500) String reason) {}
    public record RoleBrief(Long id, String code, String name, boolean primaryHandler) {}
    public record AdminUser(Long id, String username, String realName, String email, String status,
                            Long deptId, String deptName, Long requestedDeptId, String requestedDeptName,
                            List<RoleBrief> roles, OffsetDateTime createdAt, OffsetDateTime lastLoginAt,
                            OffsetDateTime lockedUntil) {}
    public record AdminDept(Long id, String code, String name, Long headUserId, String headName,
                            long userCount, int sortOrder, OffsetDateTime createdAt) {}
    public record PermissionView(String code, String name) {}
    public record RoleMember(Long userId, String realName, String deptName, boolean primaryHandler) {}
    public record RoleView(Long id, String code, String name, String description,
                           List<PermissionView> permissions, List<RoleMember> members) {}
    public record GrantView(Long id, Long userId, String userName, String permissionCode, String scopeType,
                            Long deptId, String deptName, OffsetDateTime validFrom, OffsetDateTime validUntil,
                            String reason, String grantedByName, OffsetDateTime createdAt, OffsetDateTime revokedAt,
                            String revokedByName, boolean active) {}
    public record ExpenseTypeView(Long id, String code, String name, boolean enabled, int sortOrder, boolean referenced) {}
    public record ConfigItem(String key, String value, String description, OffsetDateTime updatedAt) {}
    public record TaskAssignee(Long id, String realName, String status) {}
    public record MonitorTask(Long taskId, Long applicationId, String appNo, String type, String templateName,
                              String applicantName, String deptName, String nodeName, TaskAssignee assignee,
                              OffsetDateTime createdAt, double pendingHours, boolean overdue) {}
    public record AuditLogView(Long id, String operatorName, String action, String targetType, String targetId,
                               JsonNode beforeData, JsonNode afterData, String reason, String ip, OffsetDateTime createdAt) {}
    public record DeliveryView(Long id, Long notificationId, String recipientEmail, String title, String status,
                               int attempts, OffsetDateTime nextRetryAt, String lastError,
                               OffsetDateTime sentAt, OffsetDateTime createdAt) {}
}

package edu.zju.eas.controller.admin;

import edu.zju.eas.common.Audited;
import edu.zju.eas.dto.admin.AdminDtos.*;
import edu.zju.eas.dto.flow.TransferRequest;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.response.PageResponse;
import edu.zju.eas.security.Perms;
import edu.zju.eas.service.admin.*;
import edu.zju.eas.service.flow.FlowEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminController {
    private final UserAdminService users;
    private final DepartmentAdminService departments;
    private final GrantAdminService grants;
    private final ConfigAdminService config;
    private final AdminQueryService queries;
    private final FlowEngine flows;
    @GetMapping("/users") public ApiResponse<PageResponse<AdminUser>> users(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String status,@RequestParam(required=false) Long deptId,@RequestParam(required=false) String keyword){return ApiResponse.ok(users.list(page,size,status,deptId,keyword));}
    @GetMapping("/users/{id}") public ApiResponse<AdminUser> user(@PathVariable Long id){return ApiResponse.ok(users.get(id));}
    @PostMapping("/users/{id}/approve") public ApiResponse<AdminUser> approve(@PathVariable Long id,@Valid @RequestBody Approve req){return ApiResponse.ok(users.change(id,"APPROVE",req.deptId(),null,req.reason()));}
    @PostMapping("/users/{id}/reject") public ApiResponse<AdminUser> reject(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"REJECT",null,null,req.reason()));}
    @PostMapping("/users/{id}/disable") public ApiResponse<AdminUser> disable(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"DISABLE",null,null,req.reason()));}
    @PostMapping("/users/{id}/enable") public ApiResponse<AdminUser> enable(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"ENABLE",null,null,req.reason()));}
    @PutMapping("/users/{id}/dept") public ApiResponse<AdminUser> dept(@PathVariable Long id,@Valid @RequestBody ChangeDept req){return ApiResponse.ok(users.change(id,"DEPT",req.deptId(),null,req.reason()));}
    @PostMapping("/users/{id}/roles") public ApiResponse<AdminUser> grantRole(@PathVariable Long id,@Valid @RequestBody GrantRole req){return ApiResponse.ok(users.change(id,"GRANT_ROLE",null,req.roleCode(),req.reason()));}
    @PostMapping("/users/{id}/roles/{roleCode}/revoke") public ApiResponse<AdminUser> revokeRole(@PathVariable Long id,@PathVariable String roleCode,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"REVOKE_ROLE",null,roleCode,req.reason()));}
    @PostMapping("/users/{id}/roles/{roleCode}/primary") public ApiResponse<AdminUser> primary(@PathVariable Long id,@PathVariable String roleCode,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"PRIMARY",null,roleCode,req.reason()));}
    @PostMapping("/users/{id}/unlock") public ApiResponse<AdminUser> unlock(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(users.change(id,"UNLOCK",null,null,req.reason()));}
    @PostMapping("/users/{id}/reset-password") public ApiResponse<Map<String,String>> password(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(users.resetPassword(id,req.reason()));}
    @GetMapping("/roles") public ApiResponse<List<RoleView>> roles(){return ApiResponse.ok(users.roles());}
    @GetMapping("/departments") public ApiResponse<List<AdminDept>> departments(){return ApiResponse.ok(departments.list());}
    @PostMapping("/departments") public ApiResponse<AdminDept> createDept(@Valid @RequestBody DepartmentSave req){return ApiResponse.ok(departments.save(null,req));}
    @PutMapping("/departments/{id}") public ApiResponse<AdminDept> updateDept(@PathVariable Long id,@Valid @RequestBody DepartmentSave req){return ApiResponse.ok(departments.save(id,req));}
    @PostMapping("/departments/{id}/delete") public ApiResponse<Void> deleteDept(@PathVariable Long id,@Valid @RequestBody Reason req){departments.remove(id,req.reason());return ApiResponse.ok();}
    @PutMapping("/departments/{id}/head") public ApiResponse<AdminDept> head(@PathVariable Long id,@Valid @RequestBody SetHead req){return ApiResponse.ok(departments.setHead(id,req));}
    @GetMapping("/grants") public ApiResponse<PageResponse<GrantView>> grants(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) Long userId,@RequestParam(defaultValue="false") boolean activeOnly){return ApiResponse.ok(grants.list(page,size,userId,activeOnly));}
    @PostMapping("/grants") public ApiResponse<GrantView> grant(@Valid @RequestBody GrantCreate req){return ApiResponse.ok(grants.create(req));}
    @PostMapping("/grants/{id}/revoke") public ApiResponse<GrantView> revoke(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(grants.revoke(id,req.reason()));}
    @GetMapping("/expense-types") public ApiResponse<List<ExpenseTypeView>> expenseTypes(){return ApiResponse.ok(config.expenseTypes());}
    @PostMapping("/expense-types") public ApiResponse<ExpenseTypeView> createType(@Valid @RequestBody ExpenseTypeSave req){return ApiResponse.ok(config.saveType(null,req));}
    @PutMapping("/expense-types/{id}") public ApiResponse<ExpenseTypeView> updateType(@PathVariable Long id,@Valid @RequestBody ExpenseTypeSave req){return ApiResponse.ok(config.saveType(id,req));}
    @DeleteMapping("/expense-types/{id}") public ApiResponse<Void> deleteType(@PathVariable Long id){config.removeType(id);return ApiResponse.ok();}
    @GetMapping("/config") public ApiResponse<List<ConfigItem>> configs(){return ApiResponse.ok(config.list());}
    @PutMapping("/config/{key}") public ApiResponse<ConfigItem> config(@PathVariable String key,@Valid @RequestBody ConfigSave req){return ApiResponse.ok(config.update(key,req));}
    @GetMapping("/tasks") public ApiResponse<PageResponse<MonitorTask>> tasks(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String assigneeStatus,@RequestParam(required=false) String keyword){return ApiResponse.ok(queries.tasks(page,size,assigneeStatus,keyword));}
    @PostMapping("/tasks/{id}/transfer") @org.springframework.transaction.annotation.Transactional
    public ApiResponse<Void> transfer(@PathVariable Long id,@Valid @RequestBody TransferRequest req){flows.transfer(id,req,AdminSupport.require(Perms.ADMIN_TRANSFER));return ApiResponse.ok();}
    @GetMapping("/audit-logs") public ApiResponse<PageResponse<AuditLogView>> audit(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String action,@RequestParam(required=false) String targetType,@RequestParam(required=false) String targetId,@RequestParam(required=false) Long operatorId,@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return ApiResponse.ok(queries.auditLogs(page,size,action,targetType,targetId,operatorId,from,to));}
    @GetMapping("/deliveries") public ApiResponse<PageResponse<DeliveryView>> deliveries(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String status){return ApiResponse.ok(queries.deliveries(page,size,status));}
}

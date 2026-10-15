package edu.zju.eas.controller.admin;

import edu.zju.eas.dto.admin.AdminDtos.Reason;
import edu.zju.eas.dto.template.TemplateDtos.*;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.service.template.TemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/admin/templates")
@RequiredArgsConstructor
public class TemplateAdminController {
    private final TemplateService service;
    @GetMapping public ApiResponse<List<AdminItem>> list(){return ApiResponse.ok(service.list());}
    @GetMapping("/{id}") public ApiResponse<AdminDetail> get(@PathVariable Long id){return ApiResponse.ok(service.get(id));}
    @PostMapping public ApiResponse<AdminDetail> create(@Valid @RequestBody Create req){return ApiResponse.ok(service.create(req));}
    @PutMapping("/{id}") public ApiResponse<AdminDetail> update(@PathVariable Long id,@Valid @RequestBody Update req){return ApiResponse.ok(service.update(id,req));}
    @PostMapping("/{id}/enable") public ApiResponse<AdminDetail> enable(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(service.setEnabled(id,true,req.reason()));}
    @PostMapping("/{id}/disable") public ApiResponse<AdminDetail> disable(@PathVariable Long id,@Valid @RequestBody Reason req){return ApiResponse.ok(service.setEnabled(id,false,req.reason()));}
    @PostMapping("/{id}/draft") public ApiResponse<VersionDetail> draft(@PathVariable Long id){return ApiResponse.ok(service.createDraft(id));}
    @PutMapping("/{id}/draft") public ApiResponse<VersionDetail> save(@PathVariable Long id,@Valid @RequestBody Draft req){return ApiResponse.ok(service.saveDraft(id,req));}
    @DeleteMapping("/{id}/draft") public ApiResponse<Void> discard(@PathVariable Long id){service.discardDraft(id);return ApiResponse.ok();}
    @PostMapping("/{id}/validate") public ApiResponse<List<ValidationIssue>> validate(@PathVariable Long id){return ApiResponse.ok(service.validate(id));}
    @PostMapping("/{id}/publish") public ApiResponse<AdminDetail> publish(@PathVariable Long id,@Valid @RequestBody Publish req){return ApiResponse.ok(service.publish(id,req.changeNote()));}
}

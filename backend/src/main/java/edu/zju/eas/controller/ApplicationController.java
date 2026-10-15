package edu.zju.eas.controller;

import edu.zju.eas.dto.app.BusinessRequests.*;
import edu.zju.eas.dto.flow.ActionRequest;
import edu.zju.eas.response.ApiResponse;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.IdempotencyService;
import edu.zju.eas.service.app.ApplicationService;
import edu.zju.eas.service.flow.FlowEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@RestController
@RequestMapping("/applications")
@RequiredArgsConstructor
public class ApplicationController {
    private final ApplicationService applications;
    private final FlowEngine engine;
    private final IdempotencyService idempotency;

    @PostMapping("/purchase") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object createPurchase(@Valid @RequestBody Purchase body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.create("PURCHASE",body,u));}
    @PostMapping("/travel") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object createTravel(@Valid @RequestBody Travel body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.create("TRAVEL",body,u));}
    @PostMapping("/expense") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object createExpense(@Valid @RequestBody Expense body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.create("EXPENSE",body,u));}
    @PostMapping("/custom") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object createCustom(@Valid @RequestBody Custom body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.create("CUSTOM",body,u));}
    @PutMapping("/{id}/purchase") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object savePurchase(@PathVariable Long id,@Valid @RequestBody Purchase body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.save(id,"PURCHASE",body,u));}
    @PutMapping("/{id}/travel") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object saveTravel(@PathVariable Long id,@Valid @RequestBody Travel body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.save(id,"TRAVEL",body,u));}
    @PutMapping("/{id}/expense") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object saveExpense(@PathVariable Long id,@Valid @RequestBody Expense body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.save(id,"EXPENSE",body,u));}
    @PutMapping("/{id}/custom") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object saveCustom(@PathVariable Long id,@Valid @RequestBody Custom body,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.save(id,"CUSTOM",body,u));}
    @GetMapping
    public Object list(@AuthenticationPrincipal CurrentUser u,@RequestParam(defaultValue="mine") String scope,
        @RequestParam(required=false) String type,@RequestParam(required=false) String status,
        @RequestParam(required=false) LocalDate from,@RequestParam(required=false) LocalDate to,
        @RequestParam(required=false) String keyword,@RequestParam(required=false) Long deptId,
        @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){return ApiResponse.ok(applications.list(u,scope,type,status,from,to,keyword,deptId,page,size));}
    @GetMapping("/linkable")
    public Object linkable(@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.linkable(u));}
    @GetMapping("/{id}")
    public Object detail(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.detail(id,u));}
    @GetMapping("/{id}/logs")
    public Object logs(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.logs(id,u));}
    @GetMapping("/{id}/path-preview")
    public Object preview(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.preview(id,u));}
    @GetMapping("/{id}/invoice-duplicates")
    public Object duplicates(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.invoiceDuplicates(id,u));}
    @DeleteMapping("/{id}") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object remove(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){applications.remove(id,u);return ApiResponse.ok(null);}
    @PostMapping("/{id}/copy") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object copy(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(applications.copy(id,u));}
    @PostMapping("/{id}/submit") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object submit(@PathVariable Long id,@Valid @RequestBody ActionRequest body,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal CurrentUser u){return idempotency.execute(u,key,"POST /applications/"+id+"/submit",body,()->engine.submit(id,body.appVersion(),u));}
    @PostMapping("/{id}/withdraw") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object withdraw(@PathVariable Long id,@Valid @RequestBody ActionRequest body,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal CurrentUser u){return idempotency.execute(u,key,"POST /applications/"+id+"/withdraw",body,()->engine.withdraw(id,body.appVersion(),u));}
    @PostMapping("/{id}/urge") @PreAuthorize("hasAuthority('APP_CREATE')")
    public Object urge(@PathVariable Long id,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal CurrentUser u){return idempotency.execute(u,key,"POST /applications/"+id+"/urge",null,()->engine.urge(id,u));}
}

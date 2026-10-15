package edu.zju.eas.controller;

import edu.zju.eas.repository.ApprovalTaskMapper;
import edu.zju.eas.dto.flow.*;
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

@RestController
@RequestMapping("/tasks")
@PreAuthorize("hasAuthority('TASK_HANDLE')")
@RequiredArgsConstructor
public class TaskController {
    private final ApplicationService applications;
    private final FlowEngine engine;
    private final IdempotencyService idempotency;
    private final ApprovalTaskMapper tasks;
    @GetMapping("/pending")
    public Object pending(@AuthenticationPrincipal CurrentUser u,@RequestParam(required=false) String type,@RequestParam(required=false) String keyword,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){return ApiResponse.ok(applications.taskList(u,true,type,keyword,page,size));}
    @GetMapping("/pending-count")
    public Object pendingCount(@AuthenticationPrincipal CurrentUser u){return ApiResponse.ok(java.util.Map.of("count",tasks.countPendingOfUser(u.id())));}
    @GetMapping("/done")
    public Object done(@AuthenticationPrincipal CurrentUser u,@RequestParam(required=false) String type,@RequestParam(required=false) String keyword,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){return ApiResponse.ok(applications.taskList(u,false,type,keyword,page,size));}
    @PostMapping("/{id}/approve")
    public Object approve(@PathVariable Long id,@Valid @RequestBody ApproveRequest body,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal CurrentUser u){return idempotency.execute(u,key,"POST /tasks/"+id+"/approve",body,()->engine.approve(id,u,body));}
    @PostMapping("/{id}/reject")
    public Object reject(@PathVariable Long id,@Valid @RequestBody RejectRequest body,@RequestHeader(value="Idempotency-Key",required=false) String key,@AuthenticationPrincipal CurrentUser u){return idempotency.execute(u,key,"POST /tasks/"+id+"/reject",body,()->engine.reject(id,u,body));}
}
